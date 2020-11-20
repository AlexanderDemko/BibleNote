using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using MediatR;
using System.Collections.Generic;

namespace BibleNote.Middleware.AnalysisSessions.Queries.List
{
    public class Request : IRequest<List<AnalysisSessionVm>>
    {
        public bool OnlyLatest { get; set; }

        public int? NavigationProviderId { get; set; }
    }
}
