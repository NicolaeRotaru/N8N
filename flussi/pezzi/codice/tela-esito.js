// 94 · Foto sulla tela — esce solo la foto pronta (in «data») e le sue misure.
const p = $('Piano della tela').first().json;
const voce = $input.first() || {};
const file = voce.binary && voce.binary.data;
if (!file) throw new Error('Foto sulla tela: la foto pronta non è uscita dal montaggio.');
return [{ json: { tela_w: p.tela_w, tela_h: p.tela_h, nome_file: p.nome_file }, binary: { data: file } }];
