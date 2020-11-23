using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using MediatR;

namespace BibleNote.Middleware.AnalysisSessions.Commands.OneNote.Run
{
    public class Request : IRequest<AnalysisSessionVm>
    {
        public int NavigationProviderId { get; set; }

        public string CallbackFunction { get; set; }

        public Request(int navigationProviderId, string callbackFunction)
        {
            NavigationProviderId = navigationProviderId;
            CallbackFunction = callbackFunction;
        }
    }
}
