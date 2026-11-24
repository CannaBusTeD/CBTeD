begin;
do $$
declare u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); k text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''); ticket uuid; denied boolean:=false;
begin
 insert into auth.users(id) values(u);
 insert into public.projects(id,owner_id,title) values(p,u,'Rollback-only continuation fixture');
 insert into public.production_runs(id,project_id,workflow,instructions,rules_snapshot) values(r,p,'idea_to_publish_audio','Offline fixture',public.cbted_locked_rules(p));
 insert into public.production_steps(run_id,project_id,step_key,sequence_index,agent,studio,kind) values(r,p,'idea_develop',1,'idea_developer','core','text'),(r,p,'publish_send',2,'publisher','publish','publish');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.cbted_set_run_delegation(r,k);
 begin perform public.cbted_delegated_stage(r,k,'claim','publish_send'); exception when others then denied:=true; end;
 if not denied then raise exception 'Publish claim unexpectedly allowed'; end if;
 ticket:=(public.cbted_delegated_stage(r,k,'claim','idea_develop')#>>'{}')::uuid;
 perform public.cbted_set_run_delegation(r,null);
 denied:=false;
 begin perform public.cbted_delegated_stage(r,k,'scope'); exception when others then denied:=true; end;
 if not denied then raise exception 'Revocation failed'; end if;
 perform public.cbted_delegated_stage(r,k,'finish','idea_develop',ticket,'passed','Synthetic test evidence',jsonb_build_object('fixture',true));
 if not exists(select 1 from public.production_steps where run_id=r and step_key='idea_develop' and status='passed') then raise exception 'Receipt settlement failed'; end if;
end $$;
rollback;
