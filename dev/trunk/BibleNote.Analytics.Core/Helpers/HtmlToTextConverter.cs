using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using BibleNote.Analytics.Core.Extensions;

namespace BibleNote.Analytics.Core.Helpers
{
    public class TextNodeEntry
    {
        public HtmlNode Node { get; set; }
        public int StartIndex { get; set; }
        public int EndIndex { get; set; }
    }

    public class TextNodesString
    {
        public string Value { get; set; }
        public List<TextNodeEntry> NodesInfo { get; set; }

        public TextNodesString()
        {
            NodesInfo = new List<TextNodeEntry>();
        }
    }

    public class HtmlToTextConverter
    {
        private List<TextNodesString> _parseStrings;

        public HtmlToTextConverter()
        {
            _parseStrings = new List<TextNodesString>();
        }

        public TextNodesString Convert(HtmlNode node)
        {
            FindParseStrings(node);

            var result = new TextNodesString();

            var sb = new StringBuilder();            
            var cursor = 0;            

            foreach (var textNodesString in _parseStrings)
            {
                if (cursor > 0)
                {
                    textNodesString.NodesInfo.ForEach(e =>
                    {
                        e.StartIndex += cursor;
                        e.EndIndex += cursor;
                    });
                }

                sb.Append(textNodesString.Value);
                result.NodesInfo.AddRange(textNodesString.NodesInfo);
                cursor = sb.Length;     // todo: посмотреть исходный код StringBuilder. Долго ли идёт обращение к sb.Length. Может нам не надо хранить отдельно cursor.                
            }

            result.Value = sb.ToString();
            return result;
        }

        private void FindParseStrings(HtmlNode htmlNode)
        {
            if (!htmlNode.IsHierarchyNode())
            {
                AddParseString(BuildParseString(htmlNode.ChildNodes));
            }
            else
            {
                var nodes = new List<HtmlNode>();

                foreach (var childNode in htmlNode.ChildNodes)
                {
                    if (childNode.IsTextNode())
                    {
                        nodes.Add(childNode);
                        continue;
                    }

                    if ((childNode.HasChildNodes() || childNode.Name == "br") && nodes.Count > 0)
                    {
                        AddParseString(BuildParseString(nodes));
                        nodes.Clear();
                    }

                    if (childNode.HasChildNodes())
                        FindParseStrings(childNode);
                }

                if (nodes.Count > 0)
                    AddParseString(BuildParseString(nodes));
            }
        }

        private void AddParseString(TextNodesString parseString)
        {
            if (string.IsNullOrEmpty(parseString.Value))
                return;

            _parseStrings.Add(parseString);
        }

        private TextNodesString BuildParseString(IEnumerable<HtmlNode> nodes)
        {
            var result = new TextNodesString();
            var sb = new StringBuilder();

            foreach (var node in nodes)
            {
                var textNode = node.GetTextNode();
                if (string.IsNullOrEmpty(textNode.InnerText))
                    continue;

                result.NodesInfo.Add(new TextNodeEntry()
                {
                    Node = textNode,
                    StartIndex = sb.Length,
                    EndIndex = sb.Length + textNode.InnerText.Length - 1
                });
                sb.Append(textNode.InnerText);
            }

            result.Value = sb.ToString();
            return result;
        }
    }
}
