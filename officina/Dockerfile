# syntax=docker/dockerfile:1
# Officina dell'agenzia: immagine per Sliplane (linux/amd64).
# Su Sliplane: Dockerfile path = officina/Dockerfile, Docker context = officina (questa cartella). Vedi LEGGIMI.md.
# Tre fasi: 1) compila whisper.cpp e scarica i modelli  2) installa le dipendenze Node  3) immagine finale leggera.

# ---------------------------------------------------------------- 1) whisper.cpp + modelli
FROM debian:bookworm-slim AS whisper
# Versione di whisper.cpp: la stessa (1.9.1) compilata e provata in locale. Tag verificato su GitHub il 15/11/2026:
# v1.9.1 = commit f049fff95a089aa9969deb009cdd4892b3e74916 (clone e compilazione con questi stessi argomenti provati).
ARG WHISPER_VERSIONE=v1.9.1
# Modello multilingue: "small" (466 MB, ~750 MB di RAM misurati). Con poca memoria: WHISPER_MODELLO=small-q5_1
# (181 MB, ~460 MB di RAM) e WHISPER_MODELLO_SHA256=ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
ARG WHISPER_MODELLO=small
ARG WHISPER_MODELLO_SHA256=1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b
ARG VAD_SHA256=29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch "${WHISPER_VERSIONE}" https://github.com/ggml-org/whisper.cpp.git .
# GGML_NATIVE=OFF: il binario non dipende dalla CPU della macchina che compila; AVX2/FMA ci sono su tutti i server x86 recenti.
# Due programmi: whisper-cli (trascrive, SENZA --vad) e whisper-vad-speech-segments (trova dove si parla, per
# stringere i tempi dei sottotitoli: con --vad whisper.cpp 1.9.1 sbaglia i tempi e perde le frasi ripetute).
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON \
      -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF -DWHISPER_CURL=OFF \
 && cmake --build build -j"$(nproc)" --target whisper-cli whisper-vad-speech-segments \
 && mkdir -p /opt/whisper \
 && cp build/bin/whisper-cli build/bin/whisper-vad-speech-segments /opt/whisper/
RUN curl -fL --retry 5 -o "/opt/whisper/ggml-${WHISPER_MODELLO}.bin" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODELLO}.bin" \
 && echo "${WHISPER_MODELLO_SHA256}  /opt/whisper/ggml-${WHISPER_MODELLO}.bin" | sha256sum -c - \
 && curl -fL --retry 5 -o /opt/whisper/ggml-silero-v5.1.2.bin "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin" \
 && echo "${VAD_SHA256}  /opt/whisper/ggml-silero-v5.1.2.bin" | sha256sum -c - \
 && ln -s "ggml-${WHISPER_MODELLO}.bin" /opt/whisper/modello.bin

# ---------------------------------------------------------------- 2) dipendenze Node (sharp e resvg arrivano già compilati)
FROM node:22-bookworm-slim AS dipendenze
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------- 3) immagine finale
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libgomp1 tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8080 \
    DATI_DIR=/dati \
    WHISPER_BIN=/opt/whisper/whisper-cli \
    WHISPER_MODELLO=/opt/whisper/modello.bin \
    WHISPER_VAD=/opt/whisper/ggml-silero-v5.1.2.bin \
    WHISPER_VAD_BIN=/opt/whisper/whisper-vad-speech-segments \
    FFMPEG_THREADS=2 \
    WHISPER_THREADS=2 \
    MALLOC_ARENA_MAX=2
WORKDIR /app
COPY --from=whisper /opt/whisper /opt/whisper
COPY --from=dipendenze /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY font ./font
COPY avvio.sh /usr/local/bin/avvio.sh
RUN chmod 755 /usr/local/bin/avvio.sh \
 && mkdir -p /dati \
 && chown node:node /dati
VOLUME ["/dati"]
EXPOSE 8080
# Controllo di salute: /salute (e anche GET /) rispondono {ok:true} senza chiave.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/salute').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# avvio.sh sistema i permessi del volume /dati e poi lancia il servizio come utente "node" (non root).
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/avvio.sh"]
CMD ["node", "--max-old-space-size=512", "src/server.js"]
