using System;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.VerseParsing;
using HtmlAgilityPack;

namespace BibleNote.Providers.Html
{
    public static class HtmlParagraphChildren
    {
        // A container can hold its own paragraph followed by nested blocks.
        // Inline siblings belong to that paragraph, including all its links.
        public static void Parse(HtmlNode parent, Action<HtmlNode> parseBlock, Action<HtmlNode> parseParagraph)
        {
            var inlineNodes = new List<HtmlNode>();
            void Flush()
            {
                if (inlineNodes.Count == 0)
                    return;
                if (string.IsNullOrWhiteSpace(HtmlEntity.DeEntitize(string.Concat(inlineNodes.Select(node => node.InnerText)))))
                {
                    inlineNodes.Clear();
                    return;
                }

                // Keep the original nodes so link updates reach the saved HTML.
                // Remove the temporary wrapper afterwards, even if parsing fails.
                var wrapper = parent.OwnerDocument.CreateElement("span");
                parent.InsertBefore(wrapper, inlineNodes[0]);
                foreach (var node in inlineNodes)
                {
                    node.Remove();
                    wrapper.AppendChild(node);
                }
                inlineNodes.Clear();
                try
                {
                    parseParagraph(wrapper);
                }
                finally
                {
                    foreach (var node in wrapper.ChildNodes.ToList())
                    {
                        node.Remove();
                        parent.InsertBefore(node, wrapper);
                    }
                    wrapper.Remove();
                }
            }

            foreach (var child in parent.ChildNodes.ToList())
            {
                if (child.NodeType == HtmlNodeType.Text || child.NodeType == HtmlNodeType.Comment
                    || HtmlTags.IsInlineElement(child.Name))
                {
                    inlineNodes.Add(child);
                    continue;
                }
                Flush();
                parseBlock(child);
            }
            Flush();
        }
    }
}
