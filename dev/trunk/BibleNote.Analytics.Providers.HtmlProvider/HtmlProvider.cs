using BibleNote.Analytics.Contracts.Providers;
using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.HtmlProvider
{
    public class LocalHtmlProvider : IDocumentProvider
    {
        public bool IsReadonly
        {
            get { return false; }
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format("<a href='bnVerse:{0}'>{0}</a>", versePointer.ToString());
        }
    }
}
