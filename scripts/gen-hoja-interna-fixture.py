"""Genera los fixtures de la HOJA INTERNA con el armador REAL de pyservices.

Uso (desde vuelatour-next, con el .venv del repo hermano):
    npm run gen:hoja-interna-fixture
  = ../vuelatour-pyservices/.venv/bin/python scripts/gen-hoja-interna-fixture.py

Hermano de `gen-hoja1-fixture.py` (la hoja del CLIENTE). Por cada
`src/components/admin/quotes/__fixtures__/interna-<nombre>.payload.json`
(`CotizacionInternaPdfRequest`) escribe `interna-<nombre>.html` con el CUERPO
del documento interno — el `<div class="cot-interna">…</div>` — que es
EXACTAMENTE lo que devuelve `POST /reportes/cotizacion-interna/preview-html` y
lo que incrusta el PDF: se llama a la MISMA función que la ruta
(`render_cotizacion_interna_preview_html`), sin levantar el servidor ni
importar WeasyPrint.

El test `__tests__/quote-sheet-interna.test.tsx` compara contra estos HTML la
secuencia de tags+clases en LECTURA y los TEXTOS de las filas (tramos,
desglose, horas, cobros) que pinta `QuoteSheetInterna`. El CSS no viaja aquí:
lo custodia `styles/__tests__/hoja-interna-css-deriva.test.ts` (el archivo es
una copia byte a byte de pyservices).

Los PNG en base64 (el logo del header) se sustituyen por un marcador para que
los fixtures se puedan versionar ligeros; el marcado del cuerpo queda
byte-idéntico.
"""

import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
HERMANO = RAIZ.parent / "vuelatour-pyservices"
FIXTURES = RAIZ / "src" / "components" / "admin" / "quotes" / "__fixtures__"

_PNG = re.compile(r"data:image/png;base64,[A-Za-z0-9+/=]+")


def aligerar(html: str) -> str:
    return _PNG.sub("data:image/png;base64,…", html)


def main() -> int:
    if not HERMANO.exists():
        print(f"No existe el repo hermano: {HERMANO}", file=sys.stderr)
        return 1
    sys.path.insert(0, str(HERMANO))
    from app.schemas.reportes import CotizacionInternaPdfRequest  # noqa: E402

    try:
        # La MISMA función que sirve `POST /reportes/cotizacion-interna/preview-html`.
        from app.services.cotizacion_interna_pdf import (  # noqa: E402
            render_cotizacion_interna_preview_html as armar,
        )
    except ImportError:
        # pyservices todavía sin la Fase 2.1: se cae al cuerpo del PDF, que es
        # el MISMO marcado (el preview es un substring del HTML del PDF).
        print(
            "AVISO: pyservices aún no expone render_cotizacion_interna_preview_html; "
            "se usa _build_html y se recorta el cuerpo.",
            file=sys.stderr,
        )
        from app.services.cotizacion_interna_pdf import _build_html  # noqa: E402

        def armar(req):  # type: ignore[misc]
            html = _build_html(req)
            i = html.find('<div class="cot-interna"')
            if i < 0:
                raise SystemExit(
                    "El HTML del PDF interno no trae la raíz .cot-interna: "
                    "falta la Fase 2.1 en pyservices."
                )
            j = html.rfind("</div>")
            return html[i : j + len("</div>")]

    n = 0
    for payload_path in sorted(FIXTURES.glob("interna-*.payload.json")):
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
        html = aligerar(armar(CotizacionInternaPdfRequest(**payload)))
        destino = payload_path.with_name(payload_path.name.replace(".payload.json", ".html"))
        destino.write_text(html, encoding="utf-8")
        print(f"{destino.relative_to(RAIZ)} ({len(html)} bytes)")
        n += 1
    if n == 0:
        print("No hay payloads interna-*.payload.json", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
