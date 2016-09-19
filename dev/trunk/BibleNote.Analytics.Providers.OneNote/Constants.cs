using Microsoft.Office.Interop.OneNote;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.OneNote
{
    public static class Constants
    {
        public static readonly string OneNoteXmlNs = "http://schemas.microsoft.com/office/onenote/2010/onenote";
        public static readonly XMLSchema CurrentOneNoteSchema = XMLSchema.xs2013;
        public static string NotebookNameDelimiter = " [\"";
    }
}
