using BibleNote.Analytics.Services.VerseParsing.Contracts.ParseContext;
using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IDocumentProviderInfo
    {
        bool IsReadonly { get; }        

        string GetVersePointerLink(VersePointer versePointer);        
    }

    public interface IDocumentProvider : IDocumentProviderInfo
    {
        DocumentParseResult ParseDocument(IDocumentId documentId);
    }
}
