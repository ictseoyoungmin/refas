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
  const keys = Object.keys(value);
  if (keys.includes('$bind')) return '$bind';
  if (keys.includes('$value')) return '$value';
  return null;
}

function materialize(value, bindings, values, path) {
  if (Array.isArray(value)) return value.map((item, index) => materialize(item, bindings, values, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return value;

  const kind = placeholderKind(value);
  if (kind === '$bind') {
    const key = String(value.$bind ?? '');
    if (!key) throw new Error(`${path}.$bind must name a public input binding`);
    if (!Object.hasOwn(bindings, key)) throw new Error(`missing public input binding: ${key}`);
    return bindings[key];
  }
  if (kind === '$value') {
    const key = String(value.$value ?? '');
    if (!key) throw new Error(`${path}.$value must name a source-specific value`);
    if (Object.hasOwn(values, key)) return clone(values[key], `value ${key}`);
    if (Object.hasOwn(value, 'example')) return clone(value.example, `example ${key}`);
    throw new Error(`missing source-specific public input value: ${key}`);
  }

  const output = {};
  for (const [key, item] of Object.entries(value)) output[key] = materialize(item, bindings, values, `${path}.${key}`);
  return output;
}

function inspect(value, output, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, output, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const kind = placeholderKind(value);
  if (kind === '$bind') {
    const name = String(value.$bind ?? '');
    output.bindings.push({
      name,
      path,
      description: value.description == null ? null : String(value.description),
    });
    return;
  }
  if (kind === '$value') {
    const name = String(value.$value ?? '');
    output.values.push({
      name,
      path,
      required: !Object.hasOwn(value, 'example'),
      example: Object.hasOwn(value, 'example') ? clone(value.example, `example ${name}`) : null,
      description: value.description == null ? null : String(value.description),
    });
    return;
  }
  for (const [key, item] of Object.entries(value)) inspect(item, output, `${path}.${key}`);
}

export function materializeCapabilityInputTemplate(template, {bindings = {}, values = {}} = {}) {
  record(template, 'capability input template');
  record(bindings, 'capability input bindings');
  record(values, 'capability input values');
  return materialize(template, bindings, values, '
}

export function inspectCapabilityInputTemplate(template) {
  record(template, 'capability input template');
  const output = {bindings: [], values: []};
  inspect(template, output, '$');
  output.bindings.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  output.values.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return deepFreeze(output);
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
);
}

export function inspectCapabilityInputTemplate(template) {
  record(template, 'capability input template');
  const output = {bindings: [], values: []};
  inspect(template, output, '$');
  output.bindings.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  output.values.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  return deepFreeze(output);
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
