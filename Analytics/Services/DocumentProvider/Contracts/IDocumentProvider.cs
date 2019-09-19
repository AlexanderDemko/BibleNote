using BibleNote.Analytics.Services.VerseParsing.Models;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using System.Threading;
using System.Threading.Tasks;

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
