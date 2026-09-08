import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'h3', 'ul', 'li', 'span'];

export function stripEscapedQuotes(html: string): string {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/\\"/g, '');
}

export function normalizeLineBreaks(html: string): string {
    if (!html || typeof html !== 'string') return html;
    return html
        .replace(/\\\\r\\\\n/g, '<br>')
        .replace(/\\\\n/g, '<br>')
        .replace(/\\\\r/g, '<br>')
        .replace(/\\r\\n/g, '<br>')
        .replace(/\\n/g, '<br>')
        .replace(/\\r/g, '<br>')
        .replace(/\r\n/g, '<br>')
        .replace(/\n/g, '<br>')
        .replace(/\r/g, '<br>');
}

export function normalizeHeaders(html: string): string {
    if (!html || typeof html !== 'string') return html;
    return html
        .replace(
            /<p[^>]*>\s*<strong[^>]*>(För vem\?|For whom\?|Who is it for\?|لمن هذا المنتج\?|لمن|Vem är den för\?|Vem passar den för\?)<\/strong>\s*(<br\s*\/?>)?\s*<\/p>/gi,
            '<h3>$1</h3>'
        )
        .replace(
            /<p[^>]*>\s*<strong[^>]*>(För vem\?|For whom\?|Who is it for\?|لمن هذا المنتج\?|لمن|Vem är den för\?|Vem passar den för\?)<\/strong>\s*<br\s*\/?>\s*/gi,
            '<h3>$1</h3>'
        );
}

function tidyInlineTags(html: string): string {
    return html
        .replace(/<b\b[^>]*>/gi, '<strong>')
        .replace(/<\/b>/gi, '</strong>')
        .replace(/<i\b[^>]*>/gi, '<em>')
        .replace(/<\/i>/gi, '</em>');
}

/** HTML as shown to customers (and in the admin editor). */
export function prepareDescriptionHtml(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    return tidyInlineTags(
        DOMPurify.sanitize(normalizeHeaders(normalizeLineBreaks(stripEscapedQuotes(raw))), {
            ALLOWED_TAGS,
            ALLOWED_ATTR: [],
        })
    );
}

export function sanitizeDescriptionHtml(html: string): string {
    if (!html || typeof html !== 'string') return '';
    const cleaned = tidyInlineTags(
        DOMPurify.sanitize(html, {
            ALLOWED_TAGS,
            ALLOWED_ATTR: [],
        })
    );
    const text = cleaned.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    return text ? cleaned : '';
}
