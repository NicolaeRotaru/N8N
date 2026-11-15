# Sintetizza una frase italiana con espeak-ng (solo per le prove locali della trascrizione).
# Uso: python3 -I voce_it.py <cartella espeakng_loader> <uscita.wav> "<testo>"
import ctypes, sys, wave, os, glob
base, uscita, testo = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]), sys.argv[3]
lib = ctypes.CDLL(glob.glob(os.path.join(base, '**', 'libespeak-ng.so*'), recursive=True)[0])
# espeak-ng accetta percorsi dati corti (circa 160 caratteri): si lavora dalla cartella del pacchetto.
os.chdir(base)
campioni = []
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
def cb(wav, n, ev):
    if wav and n > 0:
        campioni.append(ctypes.string_at(wav, n * 2))
    return 0
cbref = CB(cb)
sr = lib.espeak_Initialize(1, 500, b'.', 0)
assert sr > 0, 'init fallita'
lib.espeak_SetSynthCallback(cbref)
assert lib.espeak_SetVoiceByName(b'it') == 0, 'voce it mancante'
lib.espeak_SetParameter(1, 150, 0)  # velocita parole/min
t = testo.encode('utf-8')
lib.espeak_Synth(t, len(t) + 1, 0, 1, 0, 1, None, None)
lib.espeak_Synchronize()
with wave.open(uscita, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b''.join(campioni))
print(sr, sum(len(c) for c in campioni) // 2)
