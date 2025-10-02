{
  description = "A development shell with Node.js 24, npm, and Angular CLI.";

  # Flake inputs are the dependencies your flake uses.
  # We use the nixpkgs-unstable channel for the latest packages.
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  # Flake outputs are the things your flake provides.
  # In this case, we're providing a devShell.
  outputs = { self, nixpkgs }: {
    devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {
      # The `buildInputs` are the packages available in your shell.
      buildInputs = with nixpkgs.legacyPackages.x86_64-linux; [
        # Use nodejs-24_x for Node.js version 24.
        nodejs_24
        # We use the nodePackages attribute set to get the Angular CLI.
        nodePackages."@angular/cli"
      ];

      # This is a hook that runs when you enter the shell.
      shellHook = ''
        echo "Welcome to the Node.js dev shell! Node.js version is $(node --version)"
      '';
    };
    
    # We also provide a devShell for aarch64-darwin (Apple Silicon)
    devShells.aarch64-darwin.default = nixpkgs.legacyPackages.aarch64-darwin.mkShell {
      buildInputs = with nixpkgs.legacyPackages.aarch64-darwin; [
        nodejs_24
        nodePackages."@angular/cli"
      ];

      shellHook = ''
        echo "Welcome to the Node.js dev shell! Node.js version is $(node --version)"
      '';
    };
  };
}
