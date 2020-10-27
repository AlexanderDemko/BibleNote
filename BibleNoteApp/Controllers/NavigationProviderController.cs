﻿using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Middleware.NavigationProviders.Queries.List;
using Microsoft.AspNetCore.Mvc;

namespace BibleNote.App.Controllers
{
    public class NavigationProviderController : BaseController
    {
        [HttpGet]
        public async Task<List<NavigationProviderVm>> GetAll()
        {
            var data = await Mediator.Send(new Middleware.NavigationProviders.Queries.List.Request());
            return data;
        }
    }
}