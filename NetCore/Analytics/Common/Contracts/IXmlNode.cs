using System.Collections.Generic;

namespace BibleNote.Analytics.Common.Contracts
{
    public enum IXmlNodeType
    {
        Document = 0,
        Element = 1,
        Comment = 2,
        Text = 3
    }

    public enum IXmlTextNodeMode
    {
        Exact,
        ElementWithTextNode
    }

    public interface IXmlNode
    {
        string Name { get; }

        string InnerXml { get; set; }

        string OuterXml { get; }

        IXmlNodeType NodeType { get; }

        IXmlNode GetParentNode();

        bool HasChildNodes();

        IEnumerable<IXmlNode> GetChildNodes();

        int ChildNodesCount { get; }

        IXmlNode GetFirstChild();

        string GetAttributeValue(string attributeName);

        void SetAttributeValue(string attributeName, string attributeValue);

        bool IsHierarchyNode(IXmlTextNodeMode textNodeMode);

        bool IsTextNode(IXmlTextNodeMode textNodeMode);

        bool IsValuableTextNode(IXmlTextNodeMode textNodeMode);

        IXmlNode GetTextNode();        
    }    
}
