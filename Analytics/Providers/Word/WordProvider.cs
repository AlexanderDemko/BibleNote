using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System;

namespace BibleNote.Analytics.Providers.Word
{
    public class WordProvider : IDocumentProvider
    {
        public bool IsReadonly { get { return false; } }

        public string GetVersePointerLink(VersePointer versePointer)
        {
            throw new NotImplementedException();
        }

        public bool IsReadonlyElement(ElementType elementType)
        {
            throw new NotImplementedException();
        }

        public DocumentParseResult ParseDocument(IDocumentId documentId)
        {
            throw new NotImplementedException();
        }
    }
}
