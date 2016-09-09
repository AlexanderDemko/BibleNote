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
            return node.ChildNodes.Any(child => !IsTextNode(child));
        }

        public static bool IsTextNode(this HtmlNode node)
        {
            return node.NodeType == HtmlNodeType.Text;
        }        

        public static bool IsValuableTextNode(this HtmlNode textNode)
        {
            return !string.IsNullOrEmpty(textNode.InnerHtml.Trim());
        }
    }
}
