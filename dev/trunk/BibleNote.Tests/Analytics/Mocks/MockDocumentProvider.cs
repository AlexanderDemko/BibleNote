using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using BibleNote.Analytics.Models.Common;

namespace BibleNote.Tests.Analytics.Mocks
{
    public class MockDocumentProvider : IDocumentProvider
    {
        public bool IsReadonly { get; set; }        

        public string GetVersePointerLink(VersePointer versePointer)
        {
            return string.Format("<a href='bnVerse:{0}'>{1}</a>", versePointer.ToFullString(), versePointer.ToString());
        }        
    }
}
