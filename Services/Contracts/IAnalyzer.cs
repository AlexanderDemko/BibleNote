using System;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Services.Analyzer.Models;
using BibleNote.Services.VerseParsing.Models.ParseResult;

namespace BibleNote.Services.Contracts
{
    public interface IAnalyzer
    {
        Task<AnalysisSession> AnalyzeAsync<T>(
            INavigationProvider<T> navigationProvider,
            AnalyzerOptions options,
            Action<T, DocumentParseResult> documentProcessedHandler = null,
            CancellationToken cancellationToken = default)
            where T : IDocumentId;
    }
}
