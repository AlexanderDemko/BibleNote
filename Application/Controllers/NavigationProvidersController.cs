using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.NavigationProviders.Queries.List;
using BibleNote.Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.Application.Controllers
{
    public class NavigationProvidersController : BaseController
    {
        [HttpGet]
        public async Task<List<NavigationProviderVm>> GetAllAsync()
        {
            var data = await Mediator.Send(new Middleware.NavigationProviders.Queries.List.Request());
            return data;
        }

        //[HttpPost]
        //public async Task<NavigationProviderVm> CreateOneNoteProviderAsync(NavigationProviderVm info, OneNoteNavigationProviderParameters parameters)
        //{
        //    return null;
        //}

        [HttpGet]
        public async Task CallHierarchyItemsSelectionDialog(string title, string description, string buttonText, string callbackFunction)
        {
            await Mediator.Send(new Middleware.NavigationProviders.Queries.OneNote.SelectHierarchy.Request(
                title, description, buttonText, callbackFunction));
        }

        [HttpGet]
        public async Task<HierarchyItemVm> GetHierarchyItemInfo(string hierarchyId)
        {
            return await Mediator.Send(new Middleware.NavigationProviders.Queries.OneNote.GetHierarchyInfo.Request(hierarchyId));
        }
    }
}
