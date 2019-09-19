using BibleNote.Analytics.Services.DocumentProvider.Models;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IAnalyzer
    {
        Task Analyze(
            INavigationProvider<IDocumentId> navigationProvider, 
            AnalyzerOptions options,
            CancellationToken cancellationToken = default);
    }
}
