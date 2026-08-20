# Security

RefAs reads local images, JSON, and GLB files and writes reconstruction artifacts beneath a user-selected project root.

Report path traversal, unsafe archive handling, arbitrary command execution, malformed GLB denial of service, or checkpoint integrity issues privately to the repository owner before public disclosure.

The runtime rejects artifact paths that escape the project root. It does not download models, execute model-provided scripts, or make network requests.
