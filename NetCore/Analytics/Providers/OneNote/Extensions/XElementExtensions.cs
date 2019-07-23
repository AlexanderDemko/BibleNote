using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;

namespace BibleNote.Analytics.Providers.OneNote.Extensions
{
    public static class XElementExtensions
    {
        public static XElement FirstElement(this XElement node)
        {
            return node.FirstNode?.NodeType == XmlNodeType.Element ? (XElement)node.FirstNode : null;
        }
    }
}
