{
  description = "ExifFrame - Wails Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Linux環境で必要になるC言語系ライブラリ
        # NOTE: Wails v3への移行に伴い webkitgtk_4_1 に変更
        linuxDeps = with pkgs; lib.optionals stdenv.isLinux [
          gtk3
          webkitgtk_4_1
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          # ビルド時ツール (pkg-config等)
          nativeBuildInputs = with pkgs; lib.optionals stdenv.isLinux [
            pkg-config
          ];

          # 開発に必要なパッケージ群
          buildInputs = with pkgs; [
            go_1_25     # バックエンド用 (go.mod は go 1.23 だが後方互換)
            nodejs_22   # フロントエンド用 (LTS)
          ] ++ lib.optionals stdenv.isDarwin [
            apple-sdk_15  # macOS 15+ SDK — Cocoa/WebKit フレームワーク含む
          ] ++ linuxDeps;

          # 環境に入った時に実行されるフック
          shellHook = ''
            export CGO_ENABLED=1
            export MACOSX_DEPLOYMENT_TARGET=15.0
            export PATH=$PATH:$(go env GOPATH)/bin
            
            # wails3 コマンドがなければインストール
            if ! command -v wails3 > /dev/null; then
              echo "Installing Wails v3 CLI (wails3)..."
              go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-alpha.96
            fi

            echo "Go version: $(go version)"
            echo "Node version: $(node -v)"
          '';
        };
      }
    );
}
