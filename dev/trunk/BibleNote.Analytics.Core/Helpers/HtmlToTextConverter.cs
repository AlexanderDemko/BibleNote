﻿using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using BibleNote.Analytics.Core.Extensions;
using System.Text.RegularExpressions;
using BibleNote.Analytics.Core.Constants;

namespace BibleNote.Analytics.Core.Helpers
{
    public class TextNodeEntry
    {
        public HtmlNode Node { get; set; }

        internal string CleanedText { get; set; }

        public int StartIndex { get; set; }     // границы Node в TextNodesString.Value

        public int EndIndex { get; set; }

        public int Shift { get; set; }          // сдвиг из-за вставленных ссылок

        public bool WasCleaned { get; private set; }

        public void Clean()
        {
            Node.InnerHtml = CleanedText;
            WasCleaned = true;
        }

        public void MoveBy(int shift)
        {
            StartIndex += shift;
            EndIndex += shift;
        }
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

        private static readonly Regex htmlPattern = new Regex(@"<(.|\n)*?>", RegexOptions.Compiled);             

        public string SimpleConvert(string htmlString)
        {
            if (string.IsNullOrEmpty(htmlString))
                return htmlString;

            return htmlPattern.Replace(htmlString, string.Empty);
        }

        public TextNodesString Convert(HtmlNode node)
        {
            _parseStrings = new List<TextNodesString>();
            FindParseStrings(node);

            var result = new TextNodesString();
            var sb = new StringBuilder();            
            var cursor = 0;            

            foreach (var textNodesString in _parseStrings)
            {
                if (cursor > 0)                
                    textNodesString.NodesInfo.ForEach(e => e.MoveBy(cursor));                

                sb.Append(textNodesString.Value);
                result.NodesInfo.AddRange(textNodesString.NodesInfo);
                cursor = sb.Length;
            }

            result.Value = sb.ToString();
            return result;
        }

        private void FindParseStrings(HtmlNode node)
        {
            if (!node.IsHierarchyNode())
            {
                AddParseString(BuildParseString(node.ChildNodes));
            }
            else
            {
                var nodes = new List<HtmlNode>();

                foreach (var childNode in node.ChildNodes)
                {
                    if (childNode.IsTextNode())
                    {
                        nodes.Add(childNode);
                        continue;
                    }

                    if ((childNode.HasChildNodes || childNode.Name == HtmlTags.Br) && nodes.Count > 0)
                    {
                        AddParseString(BuildParseString(nodes));
                        nodes.Clear();
                    }

                    if (childNode.HasChildNodes)
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
                if (string.IsNullOrEmpty(textNode.InnerHtml))
                    continue;

                var nodeText = textNode.InnerHtml.Replace(HtmlTags.Nbsp, " ");
                result.NodesInfo.Add(new TextNodeEntry()
                {
                    Node = textNode,
                    StartIndex = sb.Length,
                    EndIndex = sb.Length + nodeText.Length - 1,
                    CleanedText = nodeText
                });
                sb.Append(nodeText);
            }

            result.Value = sb.ToString();
            return result;
        }
    }
}
