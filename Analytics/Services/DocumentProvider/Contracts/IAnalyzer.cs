using BibleNote.Analytics.Services.DocumentProvider.Models;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IAnalyzer
    {
        void Analyze(INavigationProvider<IDocumentId> navigationProvider, AnalyzerOptions options);
    }
}
