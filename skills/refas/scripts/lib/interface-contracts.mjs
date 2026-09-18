function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function clone(value, label) {
  try {
    return structuredClone(value);
  } catch {
    throw new Error(`${label} must be structured-cloneable`);
  }
}

function placeholderKind(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.hasOwn(value, '$bind')) return '$bind';
  if (Object.hasOwn(value, '$value')) return '$value';
  return null;
}

function materialize(value, bindings, values, currentPath) {
  if (Array.isArray(value)) {
    return value.map((item, index) => materialize(item, bindings, values, `${currentPath}[${index}]`));
  }
  if (!value || typeof value !== 'object') return value;

  const kind = placeholderKind(value);
  if (kind === '$bind') {
    const key = String(value.$bind ?? '').trim();
    if (!key) throw new Error(`${currentPath}.$bind must name a public input binding`);
    if (!Object.hasOwn(bindings, key)) throw new Error(`missing public input binding: ${key}`);
    // Bindings may be Buffers, normalizers, adapters, or other public runtime
    // objects that are intentionally not structured-cloneable.
    return bindings[key];
  }

  if (kind === '$value') {
    const key = String(value.$value ?? '').trim();
    if (!key) throw new Error(`${currentPath}.$value must name a source-specific value`);
    if (Object.hasOwn(values, key)) return clone(values[key], `value ${key}`);
    if (Object.hasOwn(value, 'example')) return clone(value.example, `example ${key}`);
    throw new Error(`missing source-specific public input value: ${key}`);
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = materialize(item, bindings, values, `${currentPath}.${key}`);
  }
  return output;
}

function inspect(value, output, currentPath) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, output, `${currentPath}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const kind = placeholderKind(value);
  if (kind === '$bind') {
    const name = String(value.$bind ?? '').trim();
    if (!name) throw new Error(`${currentPath}.$bind must name a public input binding`);
    output.bindings.push({
      name,
      path: currentPath,
      description: value.description == null ? null : String(value.description),
    });
    return;
  }

  if (kind === '$value') {
    const name = String(value.$value ?? '').trim();
    if (!name) throw new Error(`${currentPath}.$value must name a source-specific value`);
    output.values.push({
      name,
      path: currentPath,
      required: !Object.hasOwn(value, 'example'),
      example: Object.hasOwn(value, 'example') ? clone(value.example, `example ${name}`) : null,
      description: value.description == null ? null : String(value.description),
    });
    return;
  }

  for (const [key, item] of Object.entries(value)) inspect(item, output, `${currentPath}.${key}`);
}

export function materializeCapabilityInputTemplate(template, {bindings = {}, values = {}} = {}) {
  record(template, 'capability input template');
  record(bindings, 'capability input bindings');
  record(values, 'capability input values');
  return materialize(template, bindings, values, '$');
}

export function inspectCapabilityInputTemplate(template) {
  record(template, 'capability input template');
  const output = {bindings: [], values: []};
  inspect(template, output, '$');
  output.bindings.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  output.values.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return output;
}

export function resolveCapabilityTemplatePointer(document, fragment = '') {
  if (fragment === '' || fragment === '#') return clone(document, 'template document');
  const raw = String(fragment);
  if (!raw.startsWith('#/')) throw new Error(`template fragment must be a JSON pointer: ${fragment}`);
  let current = document;
  for (const encoded of raw.slice(2).split('/')) {
    const token = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token)) {
      throw new Error(`template fragment does not resolve: ${fragment}`);
    }
    current = current[token];
  }
  return clone(current, `template fragment ${fragment}`);
}
