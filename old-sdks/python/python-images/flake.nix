{
  description = "A development shell for Python 3.12 with pip.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        # The nixpkgs package set for the specified system.
        # We also pass a configuration to ensure we get Python 3.12 specifically.
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          # The packages available in the development shell.
          # pkgs.python312 provides Python 3.12, which includes pip.
          buildInputs = [
            pkgs.python312
          ];

          # This hook will run when the shell is entered.
          shellHook = ''
            echo "Checking for and activating Python virtual environment..."
            if [ ! -d "venv" ]; then
              echo "Virtual environment not found. Creating one now..."
              python -m venv venv
              echo "Virtual environment created."
            fi
            source venv/bin/activate
            echo "Python virtual environment activated."
          '';
        };
      });
}

