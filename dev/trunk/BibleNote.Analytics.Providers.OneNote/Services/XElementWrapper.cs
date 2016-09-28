using BibleNote.Analytics.Core.Contracts;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Services
{
    public class XElementWrapper : IXmlNode
    {
        private XElement _node;

        public XElementWrapper(XElement node)
        {
            _node = node;
        }

        public string InnerXml { get { return _node.Value; } set { _node.Value = value; } }

        public string OuterXml { get { return _node.ToString(); } }

        public string Name { get { return _node.Name.LocalName; } }

        public int ChildNodesCount { get { return _node.Elements().Count(); } }

        public IXmlNodeType NodeType
        {
            get
            {
                switch (_node.NodeType)
                {
                    case XmlNodeType.Document:
                        return IXmlNodeType.Document;
                    case XmlNodeType.Element:
                        return IXmlNodeType.Element;
                    case XmlNodeType.Comment:
                        return IXmlNodeType.Comment;
                    case XmlNodeType.Text:
                        return IXmlNodeType.Text;
                    default:
                        throw new NotSupportedException(_node.NodeType.ToString());
                }
            }
        }

        public IXmlNode GetParentNode()
        {
            return new XElementWrapper(_node.Parent);
        }

        public string GetAttributeValue(string attributeName)
        {            
            return _node.Attribute(attributeName)?.Value;
        }

        public bool HasChildNodes()
        {
            return _node.HasElements;
        }

        public void SetAttributeValue(string attributeName, string attributeValue)
        {
            _node.SetAttributeValue(attributeName, attributeValue);            
        }

        public IXmlNode GetFirstChild()
        {
            return new XElementWrapper(_node.Elements().First());
        }

        public IEnumerable<IXmlNode> GetChildNodes()
        {
            return _node.Elements().Select(n => (IXmlNode)new XElementWrapper(n));
        }

        public bool IsHierarchyNode(IXmlTextNodeMode textNodeMode)
        {
            return _node.Elements().Any(child => !IsTextNode(child, textNodeMode));
        }

        public IXmlNode GetTextNode()
        {
            return new XElementWrapper(GetTextNode(_node));
        }

        public bool IsTextNode(IXmlTextNodeMode textNodeMode)
        {
            return IsTextNode(_node, textNodeMode);
        }

        public bool IsValuableTextNode(IXmlTextNodeMode textNodeMode)
        {
            return IsTextNode(textNodeMode) && !string.IsNullOrEmpty(GetTextNode(_node).Value.Trim());
        }

        private static XElement GetTextNode(XElement node)
        {
            XElement textNode = null;

            if (node.NodeType == XmlNodeType.Text || node.FirstNode?.NodeType == XmlNodeType.CDATA)
            {
                textNode = node;
            }
            else if (node.NodeType == XmlNodeType.Element && node.Elements().Count() == 1)
            {
                var firstChild = node.Elements().First();
                if (firstChild.NodeType == XmlNodeType.Text)
                    textNode = firstChild;
            }

            if (textNode != null)
                return textNode;

            throw new ArgumentException("Node is not TextNode");
        }

        private static bool IsTextNode(XElement node, IXmlTextNodeMode textNodeMode)
        {
            if (textNodeMode == IXmlTextNodeMode.Exact)
                return node.NodeType == XmlNodeType.Text || node.FirstNode?.NodeType == XmlNodeType.CDATA;
            else
                return node.NodeType == XmlNodeType.Text
                        || (node.NodeType == XmlNodeType.Element
                                && node.Elements().Count() == 1
                                && node.Elements().First().NodeType == XmlNodeType.Text);
        }
    }
}
