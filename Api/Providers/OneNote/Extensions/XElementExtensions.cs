using System.Xml;
using System.Xml.Linq;

namespace BibleNote.Providers.OneNote.Extensions
{
    public static class XElementExtensions
    {
        public static XElement FirstElement(this XElement node)
        {
            return node.FirstNode?.NodeType == XmlNodeType.Element ? (XElement)node.FirstNode : null;
        }
    }
}
