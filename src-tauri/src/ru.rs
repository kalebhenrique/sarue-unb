use crate::models::{RuDailyMenu, RuMenuSection};
use chrono::NaiveDate;
use pdf_extract::{
    content::Content, ColorSpace, Document, MediaBox, Object, OutputDev, OutputError, Path, PathOp,
    Transform,
};
use regex::Regex;
use scraper::{Html, Selector};
use std::collections::{BTreeMap, HashMap};

const MENU_INDEX_URL: &str = "https://ru.unb.br/cardapio-refeitorio/";
const BASE_URL: &str = "https://ru.unb.br";
const HEADER_LABEL: &str = "composicao";
const TOLERANCE: f64 = 2.0;
const SNAP_TOLERANCE: f64 = 3.0;

pub const VALID_CAMPUSES: &[&str] = &[
    "Darcy Ribeiro",
    "Ceilândia",
    "Gama",
    "Planaltina",
    "Fazenda Água Limpa",
];

fn lookup_key(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let lower = match c {
            'Á' | 'À' | 'Â' | 'Ã' | 'Ä' | 'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'É' | 'È' | 'Ê' | 'Ë' | 'é' | 'è' | 'ê' | 'ë' => 'e',
            'Í' | 'Ì' | 'Î' | 'Ï' | 'í' | 'ì' | 'î' | 'ï' => 'i',
            'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' | 'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'Ú' | 'Ù' | 'Û' | 'Ü' | 'ú' | 'ù' | 'û' | 'ü' => 'u',
            'Ç' | 'ç' => 'c',
            'Ñ' | 'ñ' => 'n',
            other => other.to_ascii_lowercase(),
        };
        out.push(lower);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn section_lookup(label: &str) -> String {
    lookup_key(label)
        .trim_end_matches(':')
        .replace([' ', '-'], "")
}

fn map_meal_type(label: &str) -> Option<&'static str> {
    let key = lookup_key(label).replace(' ', "");
    let rev: String = key.chars().rev().collect();
    for (needle, meal) in [
        ("cafedamanha", "breakfast"),
        ("desjejum", "breakfast"),
        ("almoco", "lunch"),
        ("jantar", "dinner"),
    ] {
        if key.contains(needle) || rev.contains(needle) {
            return Some(meal);
        }
    }
    None
}

fn map_section_key(label: &str) -> Option<&'static str> {
    match section_lookup(label).as_str() {
        "bebidas" | "bebidasquentes" => Some("hot_drink"),
        "panificacao" => Some("bakery"),
        "gordura" => Some("spread"),
        "complementopadrao" => Some("breakfast_complement"),
        "complementoovolactovegetariano" => Some("ovolacto_complement"),
        "complementovegetarianoestrito" => Some("vegan_complement"),
        "fruta" => Some("fruit"),
        "salada1" => Some("salad_1"),
        "salada2" => Some("salad_2"),
        "molho" | "molhoparasalada" => Some("salad_dressing"),
        "pratoprincipalpadrao" => Some("main_dish"),
        "pratoovolactovegetariano"
        | "pratoprincipalovolactovegetariano"
        | "ovolactovegetariano" => Some("ovolacto_dish"),
        "pratovegetarianoestrito" | "pratoprincipalvegetarianoestrito" | "vegetarianoestrito" => {
            Some("vegan_dish")
        }
        "guarnicao" => Some("side_dish"),
        "acompanhamentos" => Some("accompaniments"),
        "sobremesa" => Some("dessert"),
        "refresco" | "bebida(refrescode)" => Some("drink"),
        "sopa" => Some("soup"),
        "torrada" => Some("toast"),
        "opcaoextra" => Some("extra"),
        _ => None,
    }
}

fn clean_cell_text(raw: &str) -> String {
    let contains_re = Regex::new(r"(?i)\s*\(\s*cont[eé]m[^)]*\)?").unwrap();
    let without_contains = contains_re.replace_all(raw, "");
    without_contains
        .lines()
        .map(|l| l.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Debug, Clone)]
struct Cell {
    x0: f64,
    top: f64,
    x1: f64,
    bottom: f64,
    text: String,
}

impl Cell {
    fn center_x(&self) -> f64 {
        (self.x0 + self.x1) / 2.0
    }
    fn center_y(&self) -> f64 {
        (self.top + self.bottom) / 2.0
    }
    fn spans_x(&self, x: f64) -> bool {
        (self.x0 - TOLERANCE) <= x && x <= (self.x1 + TOLERANCE)
    }
    fn spans_y(&self, y: f64) -> bool {
        (self.top - TOLERANCE) <= y && y <= (self.bottom + TOLERANCE)
    }
}

#[derive(Debug, Clone, Copy)]
struct CharItem {
    x: f64,
    y: f64,
    w: f64,
    font_size: f64,
    vertical: bool,
    ch: char,
}

#[derive(Debug, Clone, Copy)]
struct HEdge {
    y: f64,
    x0: f64,
    x1: f64,
}

#[derive(Debug, Clone, Copy)]
struct VEdge {
    x: f64,
    y0: f64,
    y1: f64,
}

struct PageExtractor {
    page_height: f64,
    chars: Vec<CharItem>,
}

impl PageExtractor {
    fn new() -> Self {
        Self {
            page_height: 595.32,
            chars: Vec::new(),
        }
    }
}

impl OutputDev for PageExtractor {
    fn begin_page(
        &mut self,
        _page_num: u32,
        media_box: &MediaBox,
        _art_box: Option<(f64, f64, f64, f64)>,
    ) -> Result<(), OutputError> {
        self.page_height = media_box.ury - media_box.lly;
        self.chars.clear();
        Ok(())
    }

    fn end_page(&mut self) -> Result<(), OutputError> {
        Ok(())
    }

    fn output_character(
        &mut self,
        trm: &Transform,
        width: f64,
        _spacing: f64,
        font_size: f64,
        ch_str: &str,
    ) -> Result<(), OutputError> {
        let flip = Transform::row_major(1.0, 0.0, 0.0, -1.0, 0.0, self.page_height);
        let pos = trm.post_transform(&flip);
        let x = pos.m31;
        let y = pos.m32;
        let vertical = trm.m11.abs() < 0.1 && trm.m12.abs() > 0.1;
        let scaled_font = (trm.m11.hypot(trm.m12) * font_size).max(4.0);
        let char_w = (width * scaled_font).max(1.0);
        for ch in ch_str.chars() {
            self.chars.push(CharItem {
                x,
                y,
                w: char_w,
                font_size: scaled_font,
                vertical,
                ch,
            });
        }
        Ok(())
    }

    fn begin_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn end_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn end_line(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn stroke(
        &mut self,
        _ctm: &Transform,
        _colorspace: &ColorSpace,
        _color: &[f64],
        _path: &Path,
    ) -> Result<(), OutputError> {
        Ok(())
    }
    fn fill(
        &mut self,
        _ctm: &Transform,
        _colorspace: &ColorSpace,
        _color: &[f64],
        _path: &Path,
    ) -> Result<(), OutputError> {
        Ok(())
    }
}

fn obj_to_f64(o: &Object) -> Option<f64> {
    match o {
        Object::Integer(i) => Some(*i as f64),
        Object::Real(f) => Some(*f as f64),
        _ => None,
    }
}

fn transform_xy(m: &Transform, x: f64, y: f64) -> (f64, f64) {
    (x * m.m11 + y * m.m21 + m.m31, x * m.m12 + y * m.m22 + m.m32)
}

fn is_white_color(color: &[f64]) -> bool {
    match color.len() {
        1 => (color[0] - 1.0).abs() < 1e-3,
        3 => {
            (color[0] - 1.0).abs() < 1e-3
                && (color[1] - 1.0).abs() < 1e-3
                && (color[2] - 1.0).abs() < 1e-3
        }
        4 => {
            color[0].abs() < 1e-3
                && color[1].abs() < 1e-3
                && color[2].abs() < 1e-3
                && color[3].abs() < 1e-3
        }
        _ => false,
    }
}

/// Remove `Do` operations referencing `/Subtype /Image` XObjects so `pdf-extract`
/// does not try to parse image streams as page content streams.
fn strip_image_do_ops_in_doc(doc: &mut Document) {
    let page_ids: Vec<_> = doc.get_pages().into_values().collect();
    for page_id in page_ids {
        let Ok(content_bytes) = doc.get_page_content(page_id) else {
            continue;
        };
        let Ok(mut content) = Content::decode(&content_bytes) else {
            continue;
        };
        content.operations.retain(|op| op.operator != "Do");
        if let Ok(encoded) = content.encode() {
            let _ = doc.change_page_content(page_id, encoded);
        }
    }
}

fn extract_page_edges(
    doc: &Document,
    page_id: (u32, u16),
    page_height: f64,
) -> (Vec<HEdge>, Vec<VEdge>) {
    let mut h_edges = Vec::new();
    let mut v_edges = Vec::new();

    let Ok(content_bytes) = doc.get_page_content(page_id) else {
        return (h_edges, v_edges);
    };
    let Ok(content) = Content::decode(&content_bytes) else {
        return (h_edges, v_edges);
    };

    #[derive(Clone)]
    struct GState {
        ctm: Transform,
        stroke_color: Vec<f64>,
        fill_color: Vec<f64>,
    }

    let mut gs = GState {
        ctm: Transform::identity(),
        stroke_color: vec![0.0],
        fill_color: vec![0.0],
    };
    let mut stack: Vec<GState> = Vec::new();
    let mut path_ops: Vec<PathOp> = Vec::new();
    let flip = Transform::row_major(1.0, 0.0, 0.0, -1.0, 0.0, page_height);

    for op in &content.operations {
        match op.operator.as_str() {
            "q" => stack.push(gs.clone()),
            "Q" => {
                if let Some(prev) = stack.pop() {
                    gs = prev;
                }
            }
            "cm" if op.operands.len() == 6 => {
                if let (Some(a), Some(b), Some(c), Some(d), Some(e), Some(f)) = (
                    obj_to_f64(&op.operands[0]),
                    obj_to_f64(&op.operands[1]),
                    obj_to_f64(&op.operands[2]),
                    obj_to_f64(&op.operands[3]),
                    obj_to_f64(&op.operands[4]),
                    obj_to_f64(&op.operands[5]),
                ) {
                    let m = Transform::row_major(a, b, c, d, e, f);
                    gs.ctm = gs.ctm.pre_transform(&m);
                }
            }
            "G" | "RG" | "K" | "SC" | "SCN" => {
                let vals: Vec<f64> = op.operands.iter().filter_map(obj_to_f64).collect();
                if !vals.is_empty() {
                    gs.stroke_color = vals;
                }
            }
            "g" | "rg" | "k" | "sc" | "scn" => {
                let vals: Vec<f64> = op.operands.iter().filter_map(obj_to_f64).collect();
                if !vals.is_empty() {
                    gs.fill_color = vals;
                }
            }
            "m" if op.operands.len() == 2 => {
                if let (Some(x), Some(y)) =
                    (obj_to_f64(&op.operands[0]), obj_to_f64(&op.operands[1]))
                {
                    path_ops.push(PathOp::MoveTo(x, y));
                }
            }
            "l" if op.operands.len() == 2 => {
                if let (Some(x), Some(y)) =
                    (obj_to_f64(&op.operands[0]), obj_to_f64(&op.operands[1]))
                {
                    path_ops.push(PathOp::LineTo(x, y));
                }
            }
            "re" if op.operands.len() == 4 => {
                if let (Some(x), Some(y), Some(w), Some(h)) = (
                    obj_to_f64(&op.operands[0]),
                    obj_to_f64(&op.operands[1]),
                    obj_to_f64(&op.operands[2]),
                    obj_to_f64(&op.operands[3]),
                ) {
                    path_ops.push(PathOp::Rect(x, y, w, h));
                }
            }
            "S" | "s" | "f" | "F" | "f*" | "B" | "B*" | "b" | "b*" => {
                let is_stroke = matches!(op.operator.as_str(), "S" | "s" | "B" | "B*" | "b" | "b*");
                let is_fill = matches!(
                    op.operator.as_str(),
                    "f" | "F" | "f*" | "B" | "B*" | "b" | "b*"
                );
                let stroke_white = is_stroke && is_white_color(&gs.stroke_color);
                let fill_white = is_fill && is_white_color(&gs.fill_color);
                let visible = (is_stroke && !stroke_white) || (is_fill && !fill_white);

                if visible {
                    let xform = gs.ctm.post_transform(&flip);
                    let mut cur: Option<(f64, f64)> = None;
                    for pop in &path_ops {
                        match *pop {
                            PathOp::MoveTo(x, y) => {
                                cur = Some(transform_xy(&xform, x, y));
                            }
                            PathOp::LineTo(x, y) => {
                                let (px, py) = transform_xy(&xform, x, y);
                                if let Some((x0, y0)) = cur {
                                    if (y0 - py).abs() < 1.0 && (x0 - px).abs() > 1.0 {
                                        h_edges.push(HEdge {
                                            y: (y0 + py) / 2.0,
                                            x0: x0.min(px),
                                            x1: x0.max(px),
                                        });
                                    } else if (x0 - px).abs() < 1.0 && (y0 - py).abs() > 1.0 {
                                        v_edges.push(VEdge {
                                            x: (x0 + px) / 2.0,
                                            y0: y0.min(py),
                                            y1: y0.max(py),
                                        });
                                    }
                                }
                                cur = Some((px, py));
                            }
                            PathOp::Rect(x, y, w, h) => {
                                let (p0x, p0y) = transform_xy(&xform, x, y);
                                let (p1x, p1y) = transform_xy(&xform, x + w, y + h);
                                let rx0 = p0x.min(p1x);
                                let rx1 = p0x.max(p1x);
                                let ry0 = p0y.min(p1y);
                                let ry1 = p0y.max(p1y);
                                if (rx1 - rx0) > 1.0 {
                                    h_edges.push(HEdge {
                                        y: ry0,
                                        x0: rx0,
                                        x1: rx1,
                                    });
                                    h_edges.push(HEdge {
                                        y: ry1,
                                        x0: rx0,
                                        x1: rx1,
                                    });
                                }
                                if (ry1 - ry0) > 1.0 {
                                    v_edges.push(VEdge {
                                        x: rx0,
                                        y0: ry0,
                                        y1: ry1,
                                    });
                                    v_edges.push(VEdge {
                                        x: rx1,
                                        y0: ry0,
                                        y1: ry1,
                                    });
                                }
                            }
                            _ => {}
                        }
                    }
                }
                path_ops.clear();
            }
            "n" => {
                path_ops.clear();
            }
            _ => {}
        }
    }

    (h_edges, v_edges)
}

fn snap_and_merge_h(mut edges: Vec<HEdge>) -> Vec<HEdge> {
    if edges.is_empty() {
        return Vec::new();
    }
    edges.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    let mut groups: Vec<Vec<HEdge>> = Vec::new();
    for e in edges {
        if let Some(last_group) = groups.last_mut() {
            let avg_y = last_group.iter().map(|x| x.y).sum::<f64>() / last_group.len() as f64;
            if (e.y - avg_y).abs() <= SNAP_TOLERANCE {
                last_group.push(e);
                continue;
            }
        }
        groups.push(vec![e]);
    }

    let mut merged = Vec::new();
    for mut g in groups {
        let y = g.iter().map(|x| x.y).sum::<f64>() / g.len() as f64;
        g.sort_by(|a, b| a.x0.partial_cmp(&b.x0).unwrap());
        let mut cur_x0 = g[0].x0;
        let mut cur_x1 = g[0].x1;
        for seg in g.into_iter().skip(1) {
            if seg.x0 <= cur_x1 + SNAP_TOLERANCE {
                cur_x1 = cur_x1.max(seg.x1);
            } else {
                merged.push(HEdge {
                    y,
                    x0: cur_x0,
                    x1: cur_x1,
                });
                cur_x0 = seg.x0;
                cur_x1 = seg.x1;
            }
        }
        merged.push(HEdge {
            y,
            x0: cur_x0,
            x1: cur_x1,
        });
    }
    merged
}

fn snap_and_merge_v(mut edges: Vec<VEdge>) -> Vec<VEdge> {
    if edges.is_empty() {
        return Vec::new();
    }
    edges.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
    let mut groups: Vec<Vec<VEdge>> = Vec::new();
    for e in edges {
        if let Some(last_group) = groups.last_mut() {
            let avg_x = last_group.iter().map(|x| x.x).sum::<f64>() / last_group.len() as f64;
            if (e.x - avg_x).abs() <= SNAP_TOLERANCE {
                last_group.push(e);
                continue;
            }
        }
        groups.push(vec![e]);
    }

    let mut merged = Vec::new();
    for mut g in groups {
        let x = g.iter().map(|e| e.x).sum::<f64>() / g.len() as f64;
        g.sort_by(|a, b| a.y0.partial_cmp(&b.y0).unwrap());
        let mut cur_y0 = g[0].y0;
        let mut cur_y1 = g[0].y1;
        for seg in g.into_iter().skip(1) {
            if seg.y0 <= cur_y1 + SNAP_TOLERANCE {
                cur_y1 = cur_y1.max(seg.y1);
            } else {
                merged.push(VEdge {
                    x,
                    y0: cur_y0,
                    y1: cur_y1,
                });
                cur_y0 = seg.y0;
                cur_y1 = seg.y1;
            }
        }
        merged.push(VEdge {
            x,
            y0: cur_y0,
            y1: cur_y1,
        });
    }
    merged
}

fn has_h_segment(h_edges: &[HEdge], y: f64, x0: f64, x1: f64) -> bool {
    h_edges.iter().any(|e| {
        (e.y - y).abs() <= SNAP_TOLERANCE
            && e.x0 <= x0 + SNAP_TOLERANCE
            && e.x1 >= x1 - SNAP_TOLERANCE
    })
}

fn has_v_segment(v_edges: &[VEdge], x: f64, y0: f64, y1: f64) -> bool {
    v_edges.iter().any(|e| {
        (e.x - x).abs() <= SNAP_TOLERANCE
            && e.y0 <= y0 + SNAP_TOLERANCE
            && e.y1 >= y1 - SNAP_TOLERANCE
    })
}

fn edges_to_bboxes(raw_h: Vec<HEdge>, raw_v: Vec<VEdge>) -> Vec<(f64, f64, f64, f64)> {
    let h_edges = snap_and_merge_h(raw_h);
    let v_edges = snap_and_merge_v(raw_v);

    let mut xs: Vec<f64> = v_edges.iter().map(|v| v.x).collect();
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs.dedup_by(|a, b| (*a - *b).abs() <= SNAP_TOLERANCE);

    let mut ys: Vec<f64> = h_edges.iter().map(|h| h.y).collect();
    ys.sort_by(|a, b| a.partial_cmp(b).unwrap());
    ys.dedup_by(|a, b| (*a - *b).abs() <= SNAP_TOLERANCE);

    let mut bboxes = Vec::new();
    for (i, &x0) in xs.iter().enumerate() {
        for (j, &y0) in ys.iter().enumerate() {
            let mut found_cell = false;
            for (di, &x1) in xs[i + 1..].iter().enumerate() {
                if !has_h_segment(&h_edges, y0, x0, x1) {
                    break;
                }
                let x1_idx = i + 1 + di;
                for (dj, &y1) in ys[j + 1..].iter().enumerate() {
                    if !has_v_segment(&v_edges, x0, y0, y1) {
                        break;
                    }
                    let y1_idx = j + 1 + dj;
                    if has_h_segment(&h_edges, y1, x0, x1) && has_v_segment(&v_edges, x1, y0, y1) {
                        let crosses_v = xs[i + 1..x1_idx]
                            .iter()
                            .any(|&xm| has_v_segment(&v_edges, xm, y0, y1));
                        let crosses_h = ys[j + 1..y1_idx]
                            .iter()
                            .any(|&ym| has_h_segment(&h_edges, ym, x0, x1));
                        if !crosses_v && !crosses_h {
                            bboxes.push((x0, y0, x1, y1));
                            found_cell = true;
                            break;
                        }
                    }
                }
                if found_cell {
                    break;
                }
            }
        }
    }
    bboxes
}

fn extract_text_in_bbox(chars: &[CharItem], bbox: (f64, f64, f64, f64)) -> String {
    let (x0, top, x1, bottom) = bbox;
    let mut inside: Vec<CharItem> = chars
        .iter()
        .copied()
        .filter(|c| {
            let cx = if c.vertical { c.x } else { c.x + c.w * 0.25 };
            let cy = if c.vertical {
                c.y
            } else {
                c.y - c.font_size * 0.35
            };
            cx >= x0 - 0.5 && cx <= x1 - 0.5 && cy >= top - 0.5 && cy <= bottom + 0.5
        })
        .collect();

    if inside.is_empty() {
        return String::new();
    }

    let mostly_vertical = inside.iter().filter(|c| c.vertical).count() * 2 > inside.len();
    if mostly_vertical {
        // Vertical text (like "CAFÉ DA MANHÃ", "ALMOÇO", "JANTAR"): sort by x then y (bottom-to-top -> y desc)
        inside.sort_by(|a, b| {
            if (a.x - b.x).abs() > 3.0 {
                a.x.partial_cmp(&b.x).unwrap()
            } else {
                b.y.partial_cmp(&a.y).unwrap()
            }
        });
        let raw: String = inside.into_iter().map(|c| c.ch).collect();
        return clean_cell_text(&raw);
    }

    // Horizontal text: group by line (y within 3.0pt), sort each line by x
    inside.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap());
    let mut lines: Vec<Vec<CharItem>> = Vec::new();
    for ch in inside {
        if let Some(last_line) = lines.last_mut() {
            let avg_y = last_line.iter().map(|c| c.y).sum::<f64>() / last_line.len() as f64;
            if (ch.y - avg_y).abs() <= 3.5 {
                last_line.push(ch);
                continue;
            }
        }
        lines.push(vec![ch]);
    }

    let mut line_strings = Vec::new();
    for mut line in lines {
        line.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap());
        let mut s = String::new();
        let mut last_end: Option<f64> = None;
        for ch in line {
            if let Some(end) = last_end {
                if ch.x - end > ch.font_size * 0.18 && !s.ends_with(' ') && ch.ch != ' ' {
                    s.push(' ');
                }
            }
            s.push(ch.ch);
            last_end = Some(ch.x + ch.w);
        }
        line_strings.push(s);
    }

    clean_cell_text(&line_strings.join("\n"))
}

pub fn parse_ru_menu_pdf(pdf_bytes: &[u8]) -> Result<Vec<RuDailyMenu>, String> {
    let mut doc =
        Document::load_mem(pdf_bytes).map_err(|e| format!("PDF do cardápio inválido: {}", e))?;

    let pages = doc.get_pages();
    if pages.is_empty() {
        return Err("PDF do cardápio sem páginas.".into());
    }

    // First extract edges per page from original document
    let mut page_edges = HashMap::new();
    for (&page_num, &page_id) in &pages {
        // Determine page height from MediaBox
        let page_height = doc
            .get_object(page_id)
            .ok()
            .and_then(|o| o.as_dict().ok())
            .and_then(|d| d.get(b"MediaBox").ok())
            .and_then(|m| m.as_array().ok())
            .and_then(|arr| {
                if arr.len() == 4 {
                    Some(obj_to_f64(&arr[3]).unwrap_or(595.32) - obj_to_f64(&arr[1]).unwrap_or(0.0))
                } else {
                    None
                }
            })
            .unwrap_or(595.32);
        page_edges.insert(page_num, extract_page_edges(&doc, page_id, page_height));
    }

    // Strip Image `Do` ops before running `pdf_extract::output_doc_page`
    strip_image_do_ops_in_doc(&mut doc);

    let mut days_map: BTreeMap<NaiveDate, HashMap<&'static str, Vec<RuMenuSection>>> =
        BTreeMap::new();
    let date_re = Regex::new(r"(\d{1,2})/(\d{1,2})/(\d{4})").unwrap();

    for &page_num in pages.keys() {
        let mut extractor = PageExtractor::new();
        pdf_extract::output_doc_page(&doc, &mut extractor, page_num).map_err(|e| {
            format!(
                "Falha ao extrair texto da página {} do cardápio: {}",
                page_num, e
            )
        })?;

        let (raw_h, raw_v) = page_edges.remove(&page_num).unwrap_or_default();
        let bboxes = edges_to_bboxes(raw_h, raw_v);

        let mut cells = Vec::new();
        for bbox in bboxes {
            let text = extract_text_in_bbox(&extractor.chars, bbox);
            if !text.is_empty() {
                cells.push(Cell {
                    x0: bbox.0,
                    top: bbox.1,
                    x1: bbox.2,
                    bottom: bbox.3,
                    text,
                });
            }
        }

        let Some(header) = cells
            .iter()
            .find(|c| lookup_key(&c.text) == HEADER_LABEL)
            .cloned()
        else {
            return Err("Cabeçalho `COMPOSIÇÃO` não encontrado no PDF do cardápio.".into());
        };

        let meal_text: String = cells
            .iter()
            .filter(|c| c.x1 <= header.x0 + TOLERANCE)
            .map(|c| c.text.as_str())
            .collect::<Vec<_>>()
            .join("");
        let meal_type = map_meal_type(&meal_text)
            .ok_or_else(|| format!("Refeição `{}` desconhecida no PDF do cardápio.", meal_text))?;

        let mut day_cols: Vec<(NaiveDate, Cell)> = Vec::new();
        for c in &cells {
            if c.top > header.bottom + TOLERANCE {
                continue;
            }
            let Some(cap) = date_re.captures(&c.text) else {
                continue;
            };
            let day_num: u32 = cap[1].parse().unwrap_or(0);
            let month_num: u32 = cap[2].parse().unwrap_or(0);
            let year_num: i32 = cap[3].parse().unwrap_or(0);
            let parsed_date = NaiveDate::from_ymd_opt(year_num, month_num, day_num)
                .ok_or_else(|| format!("Data `{}` inválida no PDF do cardápio.", &cap[0]))?;
            day_cols.push((parsed_date, c.clone()));
        }
        day_cols.sort_by(|a, b| a.1.x0.partial_cmp(&b.1.x0).unwrap());

        if day_cols.is_empty() {
            return Err("Nenhuma coluna de data encontrada no PDF do cardápio.".into());
        }

        let body_top = day_cols
            .iter()
            .map(|(_, c)| c.bottom)
            .fold(header.bottom, f64::max);

        let body_cells: Vec<Cell> = cells
            .into_iter()
            .filter(|c| c.top >= body_top - TOLERANCE)
            .collect();

        let mut labels: Vec<Cell> = body_cells
            .iter()
            .filter(|c| header.spans_x(c.center_x()))
            .cloned()
            .collect();
        labels.sort_by(|a, b| {
            a.top
                .partial_cmp(&b.top)
                .unwrap()
                .then_with(|| a.x0.partial_cmp(&b.x0).unwrap())
        });

        let mut values: Vec<Cell> = body_cells
            .into_iter()
            .filter(|c| c.x0 >= header.x1 - TOLERANCE)
            .collect();
        values.sort_by(|a, b| {
            a.top
                .partial_cmp(&b.top)
                .unwrap()
                .then_with(|| a.x0.partial_cmp(&b.x0).unwrap())
        });

        let mut items_by_day_section: HashMap<(NaiveDate, usize), Vec<String>> = HashMap::new();
        for val in &values {
            let Some(label_idx) = labels.iter().position(|l| l.spans_y(val.center_y())) else {
                return Err(format!(
                    "Item `{}` sem seção correspondente no PDF do cardápio.",
                    val.text
                ));
            };
            let matched_days: Vec<NaiveDate> = day_cols
                .iter()
                .filter(|(_, col)| val.spans_x(col.center_x()))
                .map(|(d, _)| *d)
                .collect();
            if matched_days.is_empty() {
                return Err(format!(
                    "Item `{}` sem dia correspondente no PDF do cardápio.",
                    val.text
                ));
            }
            for d in matched_days {
                let entry = items_by_day_section.entry((d, label_idx)).or_default();
                if !entry.contains(&val.text) {
                    entry.push(val.text.clone());
                }
            }
        }

        let mut sections_meta = Vec::new();
        for (idx, lbl) in labels.iter().enumerate() {
            let key = map_section_key(&lbl.text)
                .ok_or_else(|| format!("Seção `{}` desconhecida no PDF do cardápio.", lbl.text))?;
            let clean_label = lbl.text.trim_end_matches(':').trim().to_string();
            sections_meta.push((idx, key, clean_label));
        }

        let mut seen_days = std::collections::HashSet::new();
        for (day, _) in &day_cols {
            if !seen_days.insert(*day) {
                continue;
            }
            let mut meal_sections = Vec::new();
            for (idx, key, clean_label) in &sections_meta {
                if let Some(items) = items_by_day_section.remove(&(*day, *idx)) {
                    if !items.is_empty() {
                        meal_sections.push(RuMenuSection {
                            key: (*key).to_string(),
                            label: clean_label.clone(),
                            items,
                        });
                    }
                }
            }
            days_map
                .entry(*day)
                .or_default()
                .insert(meal_type, meal_sections);
        }
    }

    Ok(days_map
        .into_iter()
        .map(|(date, mut meals)| RuDailyMenu {
            date: date.format("%Y-%m-%d").to_string(),
            breakfast: meals.remove("breakfast").unwrap_or_default(),
            lunch: meals.remove("lunch").unwrap_or_default(),
            dinner: meals.remove("dinner").unwrap_or_default(),
        })
        .collect())
}

pub type CampusWeekLink = (String, Option<(NaiveDate, NaiveDate)>);

pub fn parse_campus_week_links(html: &str, campus: &str) -> Result<Vec<CampusWeekLink>, String> {
    if !VALID_CAMPUSES.contains(&campus) {
        return Err(format!("Campus do RU desconhecido: {}", campus));
    }

    let doc = Html::parse_document(html);
    let target_heading = lookup_key(&format!("Cardápio {}", campus));
    let range_re = Regex::new(r"(\d{1,2}/\d{1,2}/\d{4})\s*a\s*(\d{1,2}/\d{1,2}/\d{4})").unwrap();

    // Walk all h3 and a elements in document order
    let sel = Selector::parse("h3, a[href]").unwrap();
    let mut in_campus_section = false;
    let mut found_section = false;
    let mut links = Vec::new();

    for el in doc.select(&sel) {
        let tag_name = el.value().name();
        if tag_name == "h3" {
            let text = el.text().collect::<Vec<_>>().join(" ");
            if lookup_key(&text) == target_heading {
                in_campus_section = true;
                found_section = true;
            } else if in_campus_section {
                break;
            }
        } else if in_campus_section && tag_name == "a" {
            let Some(href) = el.value().attr("href") else {
                continue;
            };
            if !href.to_ascii_lowercase().ends_with(".pdf") {
                continue;
            }
            let full_url = if href.starts_with("http://") || href.starts_with("https://") {
                href.to_string()
            } else if href.starts_with('/') {
                format!("{}{}", BASE_URL, href)
            } else {
                format!("{}/{}", BASE_URL, href)
            };

            let link_text = el.text().collect::<Vec<_>>().join(" ");
            let date_range = range_re.captures(&link_text).and_then(|cap| {
                let start = NaiveDate::parse_from_str(&cap[1], "%d/%m/%Y").ok()?;
                let end = NaiveDate::parse_from_str(&cap[2], "%d/%m/%Y").ok()?;
                if end >= start {
                    Some((start, end))
                } else {
                    None
                }
            });

            links.push((full_url, date_range));
        }
    }

    if !found_section || links.is_empty() {
        return Err(format!(
            "Nenhum PDF de cardápio encontrado para `{}`.",
            campus
        ));
    }

    Ok(links)
}

pub async fn fetch_ru_menu(campus: &str) -> Result<Vec<RuDailyMenu>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
        .build()
        .map_err(|e| format!("Erro ao inicializar cliente HTTP do RU: {}", e))?;

    let index_html = client
        .get(MENU_INDEX_URL)
        .send()
        .await
        .map_err(|e| format!("Falha ao acessar página de cardápios do RU: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Falha ao ler página de cardápios do RU: {}", e))?;

    let week_links = parse_campus_week_links(&index_html, campus)?;

    let mut join_set = tokio::task::JoinSet::new();
    for (idx, (url, range)) in week_links.into_iter().enumerate() {
        let c = client.clone();
        join_set.spawn(async move {
            let bytes = c
                .get(&url)
                .send()
                .await
                .map_err(|e| format!("Falha ao baixar PDF do cardápio ({}): {}", url, e))?
                .bytes()
                .await
                .map_err(|e| format!("Falha ao ler bytes do PDF ({}): {}", url, e))?
                .to_vec();
            let parsed = tokio::task::spawn_blocking(move || parse_ru_menu_pdf(&bytes))
                .await
                .map_err(|e| format!("Erro interno ao processar PDF: {}", e))??;
            Ok::<(usize, Option<(NaiveDate, NaiveDate)>, Vec<RuDailyMenu>), String>((
                idx, range, parsed,
            ))
        });
    }

    let mut results = Vec::new();
    while let Some(joined) = join_set.join_next().await {
        let res = joined.map_err(|e| format!("Erro em tarefa de download do RU: {}", e))??;
        results.push(res);
    }
    results.sort_by_key(|(idx, _, _)| *idx);

    let mut by_date: BTreeMap<String, RuDailyMenu> = BTreeMap::new();
    for (_, range, menus) in results {
        let mut parsed_dates = std::collections::HashSet::new();
        for menu in menus {
            parsed_dates.insert(menu.date.clone());
            by_date.insert(menu.date.clone(), menu);
        }
        if let Some((start, end)) = range {
            let mut cur = start;
            while cur <= end {
                let d_str = cur.format("%Y-%m-%d").to_string();
                if !parsed_dates.contains(&d_str) {
                    by_date.insert(
                        d_str.clone(),
                        RuDailyMenu {
                            date: d_str,
                            breakfast: Vec::new(),
                            lunch: Vec::new(),
                            dinner: Vec::new(),
                        },
                    );
                }
                let Some(next) = cur.succ_opt() else {
                    break;
                };
                cur = next;
            }
        }
    }

    Ok(by_date.into_values().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn try_fixture_bytes(name: &str) -> Option<Vec<u8>> {
        let path =
            PathBuf::from("/Users/kaleb/work/2026-2-Followw/packages/unb-browser/tests/fixtures")
                .join(name);
        std::fs::read(&path).ok()
    }

    #[test]
    fn test_parse_darcy_menu_pdf() {
        let Some(pdf) = try_fixture_bytes("cardapio-darcy.pdf") else {
            return;
        };
        let days = parse_ru_menu_pdf(&pdf).expect("Deve parsear cardapio-darcy.pdf");
        assert_eq!(days.len(), 7);
        assert_eq!(days[0].date, "2026-09-14");
        assert_eq!(days[6].date, "2026-09-20");

        let monday = &days[0];
        let bf_comp = monday
            .breakfast
            .iter()
            .find(|s| s.key == "breakfast_complement")
            .expect("breakfast_complement");
        assert!(!bf_comp.items.is_empty());

        let lunch_main = monday
            .lunch
            .iter()
            .find(|s| s.key == "main_dish")
            .expect("main_dish");
        assert_eq!(
            lunch_main.items,
            vec!["Carne de sol trinchada com cebola roxa"]
        );

        // Bebida quente mesclada em todos os dias
        for day in &days {
            let hot = day
                .breakfast
                .iter()
                .find(|s| s.key == "hot_drink")
                .expect("hot_drink");
            assert_eq!(
                hot.items,
                vec!["Leite integral OU Bebida de soja", "Café OU chá"]
            );
        }
    }

    #[test]
    fn test_parse_all_fixtures() {
        for name in [
            "cardapio-darcy-28-09.pdf",
            "cardapio-darcy-12-10.pdf",
            "cardapio-fazenda.pdf",
            "cardapio-gama-28-09.pdf",
        ] {
            let Some(pdf) = try_fixture_bytes(name) else {
                continue;
            };
            let days =
                parse_ru_menu_pdf(&pdf).unwrap_or_else(|e| panic!("Falha em {}: {}", name, e));
            assert!(!days.is_empty(), "{} retornou vazio", name);
        }
    }

    #[test]
    fn test_student_card_and_statement_and_cpf() {
        let card_path = PathBuf::from(
            "/Users/kaleb/work/2026-2-Followw/packages/sigaa-client/tests/fixtures/carteirinha.pdf",
        );
        if let Ok(card_bytes) = std::fs::read(&card_path) {
            let (token, valid_until) =
                crate::sigaa::SigaaClient::parse_student_card_pdf(&card_bytes).expect("parse card");
            assert_eq!(token, "TESTE0000000001");
            assert_eq!(valid_until, "2027-03-01");
        }

        let sample_ru_html = r#"
        <div>
          <h3>Cardápio Darcy Ribeiro</h3>
          <a href="/images/Cardapio/cardapio-14-09.pdf">De 14/09/2026 a 20/09/2026</a>
          <h3>Cardápio Gama</h3>
          <a href="/images/Cardapio/gama.pdf">De 14/09/2026 a 20/09/2026</a>
        </div>
        "#;
        let links = parse_campus_week_links(sample_ru_html, "Darcy Ribeiro").expect("links");
        assert_eq!(links.len(), 1);
        assert_eq!(
            links[0].0,
            "https://ru.unb.br/images/Cardapio/cardapio-14-09.pdf"
        );

        let extrato_html = r#"
        <h4>Extrato no Restaurante Universitário</h4>
        <table>
          <tr><td>20/09/2026 12:23</td><td>Saldo</td><td>R$ 15,50</td></tr>
          <tr><td>17/09/2026 12:00</td><td>Grupo 3 Almoço</td><td>-R$ 6,10</td></tr>
        </table>
        "#;
        let (balance, group, entries) =
            crate::sigaa::SigaaClient::parse_ru_statement_html(extrato_html).expect("extrato");
        assert!((balance - 15.50).abs() < 1e-6);
        assert_eq!(group, Some(3));
        assert_eq!(entries.len(), 2);

        let hist = "Dados Pessoais\nNome: Aluno\nCPF: 123.456.789-00\nComponentes Curriculares";
        assert_eq!(
            crate::sigaa::SigaaClient::extract_cpf_from_historico_text(hist).as_deref(),
            Some("12345678900")
        );
    }
}
