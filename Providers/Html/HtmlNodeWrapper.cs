using System;
using System.Collections.Generic;
using System.Linq;
using BibleNote.Services.VerseParsing.Contracts;
using HtmlAgilityPack;

namespace BibleNote.Providers.Html
{
    public class HtmlNodeWrapper : IXmlNode
    {
        private HtmlNode _node;

        public HtmlNodeWrapper(string html)
        {
            var htmlDoc = new HtmlDocument();
            htmlDoc.LoadHtml(html);
            _node = htmlDoc.DocumentNode;
        }

        public HtmlNodeWrapper(HtmlNode node, bool isReadonly = false)
        {
            _node = node;
            this.IsReadonly = isReadonly;
        }

        public string InnerXml { get { return _node.InnerHtml; } set { _node.InnerHtml = value; } }

        public string OuterXml { get { return _node.OuterHtml; } }

        public string Name { get { return _node.Name; } }

        public int ChildNodesCount { get { return _node.ChildNodes.Count; } }

        public IXmlNodeType NodeType
        {
            get
            {
                switch (_node.NodeType)
                {
                    case HtmlNodeType.Document:
                        return IXmlNodeType.Document;
                    case HtmlNodeType.Element:
                        return IXmlNodeType.Element;
                    case HtmlNodeType.Comment:
                        return IXmlNodeType.Comment;
                    case HtmlNodeType.Text:
                        return IXmlNodeType.Text;
                    default:
                        throw new NotSupportedException(_node.NodeType.ToString());
                }
            }
        }

        public bool IsReadonly { get; private set; }

        public IXmlNode GetParentNode()
        {
            return new HtmlNodeWrapper(_node.ParentNode);
        }

        public string GetAttributeValue(string attributeName)
        {
            return _node.GetAttributeValue(attributeName, null);
        }

        public bool HasChildNodes()
        {
            return _node.HasChildNodes;
        }

        public void SetAttributeValue(string attributeName, string attributeValue)
        {
            _node.SetAttributeValue(attributeName, attributeValue);            
        }

        public IXmlNode GetFirstChild()
        {
            return new HtmlNodeWrapper(_node.FirstChild);
        }

        public IEnumerable<IXmlNode> GetChildNodes()
        {
            return _node.ChildNodes.Select(n => (IXmlNode)new HtmlNodeWrapper(n));
        }

        public bool IsHierarchyNode(IXmlTextNodeMode textNodeMode)
        {
            return _node.ChildNodes.Any(child => !IsTextNode(child, textNodeMode));
        }

        public IXmlNode GetTextNode()
        {
            return new HtmlNodeWrapper(GetTextNode(_node));
        }

        public bool IsTextNode(IXmlTextNodeMode textNodeMode)
        {
            return IsTextNode(_node, textNodeMode);
        }

        public bool IsValuableTextNode(IXmlTextNodeMode textNodeMode)
        {
            return IsTextNode(textNodeMode) && !string.IsNullOrEmpty(GetTextNode(_node).InnerHtml.Trim());
        }

        private static HtmlNode GetTextNode(HtmlNode node)
        {
            HtmlNode textNode = null;

            if (node.NodeType == HtmlNodeType.Text)
                textNode = node;
            else if (node.NodeType == HtmlNodeType.Element && node.ChildNodes.Count == 1 && node.FirstChild.NodeType == HtmlNodeType.Text)
                textNode = node.FirstChild;

            if (textNode != null)
                return textNode;

            throw new ArgumentException("Node is not TextNode");
        }

        private static bool IsTextNode(HtmlNode node, IXmlTextNodeMode textNodeMode)
        {
            if (textNodeMode == IXmlTextNodeMode.Exact)
                return node.NodeType == HtmlNodeType.Text;
            else
                return node.NodeType == HtmlNodeType.Text
                        || (node.NodeType == HtmlNodeType.Element
                                && node.ChildNodes.Count == 1
                                && node.FirstChild.NodeType == HtmlNodeType.Text);
        }
    }
}
