using System.Collections.Generic;

namespace BibleNote.Analytics.Core.Contracts
{
    public enum IXmlNodeType
    {
        Document = 0,
        Element = 1,
        Comment = 2,
        Text = 3
    }

    public interface IXmlNode
    {
        string Name { get; }

        string InnerXml { get; set; }

        string OuterXml { get; }

        IXmlNodeType NodeType { get; }

        bool HasChildNodes();

        ICollection<IXmlNode> ChildNodes { get; }

        string GetAttributeValue(string attributeName);

        void SetAttributeValue(string attributeName, string attributeValue);
    }    
}
