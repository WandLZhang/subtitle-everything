#!/usr/bin/env bash
# Download the sherpa-onnx prebuilt arm64-v8a native libraries into app/src/main/jniLibs.
# These are not committed (see .gitignore); run this once before building from source.
set -euo pipefail
VER="v1.13.4"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
JNI="$DIR/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$JNI"
TMP="$(mktemp -d)"
echo "Downloading sherpa-onnx $VER android libs…"
curl -sL -o "$TMP/sherpa.tar.bz2" \
  "https://github.com/k2-fsa/sherpa-onnx/releases/download/$VER/sherpa-onnx-$VER-android.tar.bz2"
python3 -c "import tarfile,sys; tarfile.open('$TMP/sherpa.tar.bz2','r:bz2').extractall('$TMP/x')"
cp "$TMP"/x/jniLibs/arm64-v8a/*.so "$JNI/"
rm -rf "$TMP"
echo "Copied .so into $JNI:"
ls -1 "$JNI"
