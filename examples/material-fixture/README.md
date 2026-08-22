# Independent PBR material fixture

Runs the canonical dependency-light PBR backend as a separate process against four glTF metallic-roughness materials: dielectric polymer, painted/anodized metal, bare metal, and rough rubber. It renders eight views twice under one fixed rig and fails unless every output digest is identical.

Generated output is excluded from release packages.
