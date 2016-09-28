using BibleNote.Analytics.Core.Contracts;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;

namespace BibleNote.Analytics.Providers.Html
{
    public class HtmlNodeWrapper : IXmlNode
    {
        private HtmlNode _node;

        public HtmlNodeWrapper(HtmlNode node)
        {
            _node = node;
        }

        public ICollection<IXmlNode> ChildNodes
        {
            get
            {
                return _node.ChildNodes.Select(n => (IXmlNode)new HtmlNodeWrapper(n)).ToList();
            }
        }

        public string InnerXml { get { return _node.InnerHtml; } set { _node.InnerHtml = value; } }

        public string OuterXml { get { return _node.OuterHtml; } }

        public string Name { get { return _node.Name; } }

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

        public string GetAttributeValue(string attributeName)
        {
            return _node.Attributes[attributeName]?.Value;
        }

        public bool HasChildNodes()
        {
            return _node.HasChildNodes;
        }

        public void SetAttributeValue(string attributeName, string attributeValue)
        {
            var attr = _node.Attributes[attributeName];
            if (attr != null)
                attr.Value = attributeValue;
            else
                _node.Attributes.Add(attributeName, attributeValue);
        }
    }
}
