#!/bin/sh
# Prepara in .locale/ quello che serve alla prova con il whisper VERO (facoltativa: senza, quella prova si salta).
#  - whisper.cpp v1.9.1 compilato: whisper-cli + whisper-vad-speech-segments (da GitHub; se GitHub non è
#    raggiungibile, dai sorgenti identici dentro il pacchetto npm nodejs-whisper@0.4.1)
#  - modello multilingue "small" + modello VAD silero (Hugging Face, con controllo sha256)
#  - voce sintetica italiana espeak-ng (wheel PyPI espeakng-loader) per generare l'audio di prova
# Uso: sh strumenti/prepara-whisper-locale.sh   (dalla cartella officina)
set -eu
L="$(pwd)/.locale"
mkdir -p "$L/modelli" "$L/espeak"

if [ ! -x "$L/whisper.cpp/build/bin/whisper-cli" ] || [ ! -x "$L/whisper.cpp/build/bin/whisper-vad-speech-segments" ]; then
  if [ -d "$L/whisper.cpp" ]; then :; elif ! git clone --depth 1 --branch v1.9.1 https://github.com/ggml-org/whisper.cpp.git "$L/whisper.cpp" 2>/dev/null; then
    echo "GitHub non raggiungibile: uso i sorgenti whisper.cpp 1.9.1 inclusi in nodejs-whisper@0.4.1 (npm)"
    mkdir -p "$L/npm-whisper" && (cd "$L/npm-whisper" && npm pack nodejs-whisper@0.4.1 --silent && tar xzf nodejs-whisper-0.4.1.tgz)
    rm -rf "$L/whisper.cpp" && cp -r "$L/npm-whisper/package/cpp/whisper.cpp" "$L/whisper.cpp"
    find "$L/whisper.cpp" -name "*.node" -type f -delete
  fi
  cmake -S "$L/whisper.cpp" -B "$L/whisper.cpp/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF -DWHISPER_CURL=OFF
  cmake --build "$L/whisper.cpp/build" -j"$(nproc)" --target whisper-cli whisper-vad-speech-segments
fi

scarica() { # url file sha256
  if [ ! -f "$2" ]; then curl -fL --retry 5 -o "$2.tmp" "$1" && mv "$2.tmp" "$2"; fi
  echo "$3  $2" | sha256sum -c -
}
scarica https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin "$L/modelli/ggml-small.bin" 1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
scarica https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin "$L/modelli/ggml-silero-v5.1.2.bin" 29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf

if [ ! -d "$L/espeak/estratto/espeakng_loader" ]; then
  pip download --no-deps --only-binary=:all: --platform manylinux2014_x86_64 --python-version 313 espeakng-loader==0.2.4 -d "$L/espeak"
  mkdir -p "$L/espeak/estratto" && python3 -I -m zipfile -e "$L"/espeak/espeakng_loader-0.2.4-*.whl "$L/espeak/estratto"
fi
echo "Pronto: ora 'npm test' fa anche la prova con il whisper vero."
