using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using BibleNote.Services.ModulesManager.Scheme.ZefaniaXml;

namespace BibleNote.Application.Controllers
{
    public static class VerseRichTextProjector
    {
        public static VerseRichTextResponse Project(VERS verse)
        {
            if (verse?.Items == null)
                return null;

            var result = new VerseRichTextResponse
            {
                Text = string.Empty,
                Decorations = new List<VerseTextDecorationResponse>(),
                Breaks = new List<VerseTextBreakResponse>(),
                Footnotes = new List<VerseFootnoteResponse>()
            };
            var text = new StringBuilder();
            AppendItems(verse.Items, text, result);
            result.Text = WebUtility.HtmlDecode(text.ToString()).Replace("|", string.Empty);
            if (result.Decorations.Count == 0 && result.Breaks.Count == 0 && result.Footnotes.Count == 0)
                return null;
            return result;
        }

        private static void AppendItems(object[] items, StringBuilder text, VerseRichTextResponse result)
        {
            if (items == null)
                return;

            foreach (var item in items)
            {
                if (item is string value)
                {
                    text.Append(WebUtility.HtmlDecode(value));
                }
                else if (item is STYLE style)
                {
                    var start = text.Length;
                    AppendItems(style.Items, text, result);
                    AddDecoration(result, start, text.Length, StyleKind(style));
                }
                else if (item is SUP superscript)
                {
                    var start = text.Length;
                    AppendItems(superscript.Items, text, result);
                    AddDecoration(result, start, text.Length, superscript.art == SupType.xsub ? "subscript" : "superscript");
                }
                else if (item is GRAM grammar)
                {
                    AppendItems(grammar.Items, text, result);
                }
                else if (item is BR lineBreak)
                {
                    result.Breaks.Add(new VerseTextBreakResponse
                    {
                        Offset = text.Length,
                        Kind = lineBreak.art == BreakType.xp ? "paragraph" : "line"
                    });
                }
                else if (item is NOTE note)
                {
                    var noteText = string.Concat(note.Text ?? new string[0]);
                    if (note.Items != null)
                        noteText += VERS.GetVerseText(note.Items) ?? string.Empty;
                    result.Footnotes.Add(new VerseFootnoteResponse
                    {
                        Offset = text.Length,
                        Marker = WebUtility.HtmlDecode(note.ex ?? string.Empty),
                        Text = WebUtility.HtmlDecode(noteText).Trim()
                    });
                }
            }
        }

        private static string StyleKind(STYLE style)
        {
            if (string.Equals(style.id, "mybible-words-of-jesus", StringComparison.OrdinalIgnoreCase))
                return "words-of-jesus";
            if (string.Equals(style.id, "mybible-translator-added", StringComparison.OrdinalIgnoreCase))
                return "translator-added";
            if (string.Equals(style.id, "mybible-special-text", StringComparison.OrdinalIgnoreCase))
                return "special-text";
            return style.fsSpecified ? style.fs.ToString().ToLowerInvariant() : "styled";
        }

        private static void AddDecoration(VerseRichTextResponse result, int start, int end, string kind)
        {
            if (end <= start)
                return;
            result.Decorations.Add(new VerseTextDecorationResponse
            {
                StartOffset = start,
                EndOffset = end,
                Kind = kind
            });
        }
    }
}
