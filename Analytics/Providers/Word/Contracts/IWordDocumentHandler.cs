using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using DocumentFormat.OpenXml.Packaging;

namespace BibleNote.Analytics.Providers.Html.Contracts
{
    public interface IWordDocumentHandler : IDocumentHandler
    {
        WordprocessingDocument WordDocument { get; }
    }
}
