using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using MediatR;


namespace BibleNote.Middleware.AnalysisSessions.Commands.OneNote.LoadStatus
{
    public class Request : IRequest<AnalysisSessionVm>
    {
        public int NavigationProviderId { get; set; }

        public Request(int navigationProviderId)
        {
            NavigationProviderId = navigationProviderId;
        }
    }
}
