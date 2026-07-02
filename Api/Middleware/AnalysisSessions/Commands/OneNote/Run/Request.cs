using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.AnalysisSessions.Commands.OneNote.Run
{
    public class Request : IRequest<AnalysisSessionVm>
    {
        public int NavigationProviderId { get; set; }

        public string DocumentProcessedCallbackFunction { get; set; }

        public string FinishedCallbackFunction { get; set; }

        public Request(int navigationProviderId, string documentProcessedCallbackFunction, string finishedCallbackFunction)
        {
            NavigationProviderId = navigationProviderId;
            DocumentProcessedCallbackFunction = documentProcessedCallbackFunction;
            FinishedCallbackFunction = finishedCallbackFunction;
        }
    }
}
