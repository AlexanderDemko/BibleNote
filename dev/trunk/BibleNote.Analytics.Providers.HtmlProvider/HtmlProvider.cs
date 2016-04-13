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
            get { return false; }  // а почему вообще localHtmlProvider должен отличаться от webHtmlProvider? Локальные html файлы лучше тоже не менять, а преобразовывать при отбражении только.
        }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format($"<a href='bnVerse:{versePointer}'>{versePointer.GetOriginalVerseString()}</a>");
        }
    }
}
