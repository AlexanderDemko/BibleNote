using BibleNote.Services.Contracts;
using DocumentFormat.OpenXml.Packaging;

namespace BibleNote.Providers.Word.Contracts
{
    public interface IWordDocumentHandler : IDocumentHandler
    {
        WordprocessingDocument WordDocument { get; }
    }
}
