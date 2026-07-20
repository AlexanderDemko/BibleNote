using System.Collections.Generic;
using BibleNote.Services.VerseParsing.Contracts;

namespace BibleNote.Providers.Html
{
    public sealed class PlainTextNodeWrapper : IXmlNode
    {
        public PlainTextNodeWrapper(string text)
        {
            InnerXml = text ?? string.Empty;
        }

        public string Name => "#text";

        public string InnerXml { get; set; }

        public string OuterXml => InnerXml;

        public IXmlNodeType NodeType => IXmlNodeType.Text;

        public int ChildNodesCount => 0;

        public bool IsReadonly => true;

        public IXmlNode GetParentNode() => null;

        public bool HasChildNodes() => false;

        public IEnumerable<IXmlNode> GetChildNodes()
        {
            yield break;
        }

        public IXmlNode GetFirstChild() => null;

        public string GetAttributeValue(string attributeName) => null;

        public void SetAttributeValue(string attributeName, string attributeValue)
        {
        }

        public bool IsHierarchyNode(IXmlTextNodeMode textNodeMode) => false;

        public bool IsTextNode(IXmlTextNodeMode textNodeMode) => true;

        public bool IsValuableTextNode(IXmlTextNodeMode textNodeMode) => !string.IsNullOrWhiteSpace(InnerXml);

        public IXmlNode GetTextNode() => this;
    }
}
