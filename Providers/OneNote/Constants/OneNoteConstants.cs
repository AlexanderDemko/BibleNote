using Microsoft.Office.Interop.OneNote;
using System.Xml.Linq;

namespace BibleNote.Providers.OneNote.Constants
{
    public static class OneNoteConstants
    {
        public static readonly XNamespace OneNoteXmlNs = "http://schemas.microsoft.com/office/onenote/2013/onenote";
        public const XMLSchema CurrentOneNoteSchema = XMLSchema.xs2013;
        public const string NotebookNameDelimiter = " [\"";
        public const string OneNotePrefix = "one";
    }
}
