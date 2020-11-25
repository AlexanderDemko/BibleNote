using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.AnalysisSessions.SharedViewModels;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class AnalysisSessionsController : BaseController
    {
        [HttpGet]
        public Task<List<AnalysisSessionVm>> GetAllAsync(bool onlyLatest, int? navigationProviderId)
        {
            return Mediator.Send(new Middleware.AnalysisSessions.Queries.List.Request(onlyLatest, navigationProviderId));
        }      

        #region OneNote

        [HttpGet]
        public Task<AnalysisSessionVm> LoadOneNoteAnalysisSessionStatus(int navigationProviderId)
        {
            return Mediator.Send(new Middleware.AnalysisSessions.Commands.OneNote.LoadStatus.Request(navigationProviderId));
        }

        [HttpPost]
        public Task<AnalysisSessionVm> CreateOneNoteProviderAsync(
            int navigationProviderId, 
            string documentProcessedCallbackFunction, 
            string finishedCallbackFunction)
        {
            return Mediator.Send(
                new Middleware.AnalysisSessions.Commands.OneNote.Run.Request(
                    navigationProviderId, documentProcessedCallbackFunction, finishedCallbackFunction));
        }        

        #endregion
    }
}
