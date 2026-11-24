// Una riga del Calendario per elemento (il nodo Google Sheets le aggiunge in fondo).
return ($input.first().json.righe || []).map((r) => ({ json: r }));
