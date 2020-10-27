﻿using System.Threading;
using System.Threading.Tasks;
using BibleNote.Services.DocumentProvider.Models;

namespace BibleNote.Services.DocumentProvider.Contracts
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