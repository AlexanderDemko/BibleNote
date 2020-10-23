using BibleNote.Analytics.Services.DocumentProvider.Models;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Services.DocumentProvider.Contracts
{
    public interface IAnalyzer        
    {
        Task AnalyzeAsync<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            CancellationToken cancellationToken = default)
            where T : IDocumentId;
    }
}
