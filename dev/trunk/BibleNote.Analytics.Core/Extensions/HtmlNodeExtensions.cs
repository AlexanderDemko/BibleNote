using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Core.Extensions
{
    public static class HtmlNodeExtensions
    {
        public static bool IsHierarchyNode(this HtmlNode node)
        {
            return node.ChildNodes.FirstOrDefault(child => !IsTextNode(child)) != null;
        }

        public static bool IsTextNode(this HtmlNode node)
        {
            return node.NodeType == HtmlNodeType.Text 
                || (node.NodeType == HtmlNodeType.Element && node.ChildNodes.Count == 1 && node.ChildNodes[0].NodeType == HtmlNodeType.Text);
        }

        public static bool HasChildNodes(this HtmlNode node)
        {
            return node.ChildNodes.Count > 0;
        }

        public static string GetTextNodeInnerText(this HtmlNode node)
        {
            HtmlNode textNode = null;

            if (node.NodeType == HtmlNodeType.Text)
                textNode = node;

            if (node.NodeType == HtmlNodeType.Element && node.ChildNodes.Count == 1 && node.ChildNodes[0].NodeType == HtmlNodeType.Text)
                textNode = node.ChildNodes[0];

            if (textNode != null)
                return textNode.InnerText;

            throw new ArgumentException("Node is not TextNode");
        }
    }
}
