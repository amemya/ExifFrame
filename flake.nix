{
  description = "ExifFrame - Wails Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-wails.url = "github:NixOS/nixpkgs/8059b99f2c04a00a77979ae4bcb5611a61b638ba"; # Wails v2.10.2
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, nixpkgs-wails, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        pkgs-wails = nixpkgs-wails.legacyPackages.${system};

        # Linux環境で必要になるC言語系ライブラリ
        # NOTE: Wails v3移行時に webkitgtk_4_0 → webkitgtk_4_1 へ変更する
        linuxDeps = with pkgs; lib.optionals stdenv.isLinux [
          gtk3
          webkitgtk_4_0
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          # ビルド時ツール (pkg-config等)
          nativeBuildInputs = with pkgs; lib.optionals stdenv.isLinux [
            pkg-config
          ];

          # 開発に必要なパッケージ群
          # macOS: Cocoa/WebKit等のフレームワークはデフォルトSDKに含まれるため明示不要
          buildInputs = with pkgs; [
            go_1_25     # バックエンド用 (go.mod は go 1.23 だが後方互換)
            nodejs_22   # フロントエンド用 (LTS)
            pkgs-wails.wails # Wails CLIツール本体 (v2.10.2)
          ] ++ linuxDeps;

          # 環境に入った時に実行されるフック
          shellHook = ''
            export CGO_ENABLED=1
            echo "Go version: $(go version)"
            echo "Node version: $(node -v)"
            echo "Wails version: $(wails version)"
          '';
        };
      }
    );
}
