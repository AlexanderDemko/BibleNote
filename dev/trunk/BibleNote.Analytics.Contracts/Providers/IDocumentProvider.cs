using BibleNote.Analytics.Models.Common;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentProvider
    {
        bool IsReadonly { get; }

        string GetVersePointerLink(VersePointer versePointer);

        DocumentParseResult ParseDocument(IDocumentId documentId);
    }
}
