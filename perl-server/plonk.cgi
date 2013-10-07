#!/usr/bin/env perl 
use strict;
use warnings;

# USE: ./perl-server/plonk.cgi daemon
# This is prototype alpha code
# Protocol and data structure may change

use lib qw( ../lib lib );
use Mojolicious::Lite;
use Mojo::IOLoop;
  
# use Data::Dumper;

my $state_file = 'state.pid';

if (-e $state_file){ 
	exit;
}

$SIG{'INT'} = sub {
    unlink $state_file or die "Could not unlink ".$state_file;
    exit;
};

my $max_age = 1; 	# drop cursors older than this
my $clients_tx = {};
my $clients_cursors = {};
 
app->secret('A not vey good passphrase.');

websocket '/' => sub {
	my $self = shift;
	my $client_id = sprintf "%s", $self->tx;
	$clients_tx->{$client_id} = { tx => $self->tx };
	$self->app->log->debug('WebSocket opened.');
    # Increase inactivity timeout for connection a bit
    Mojo::IOLoop->stream($self->tx->connection)->timeout(3000);

	$self->on(message => sub {
		my ($self, $msg) = @_;
		# warn $msg;
		my ($user, $x, $y, $scaleCursor, $gain, $pan, $patch, $pitch) = split(/,/,$msg);
		# No y == no sound
		if (defined $y){
			$clients_cursors->{ $client_id }->{userId} = $user;
			$clients_cursors->{ $client_id }->{xy} = [$x+0, $y+0];
			$clients_cursors->{ $client_id }->{scaleCursor} = $scaleCursor;
			$clients_cursors->{ $client_id }->{patch} = $patch;
			$clients_cursors->{ $client_id }->{pitch} = $pitch ne ''? $pitch+0 : undef;
			$clients_cursors->{ $client_id }->{gain} = $gain +0;
			$clients_cursors->{ $client_id }->{pan} = $pan +0;
			# warn Dumper( $clients_cursors );
			for my $i (keys %$clients_tx) {
				$clients_tx->{$i}->{tx}->send(
					Mojo::JSON->new->encode({ 
						cursors => $clients_cursors
					})
				);
			}
		}
	});
	
	$self->on(finish => sub {
		delete $clients_tx->{$client_id};
		delete $clients_cursors->{$client_id};
		$self->app->log->debug('Finished with '.$client_id);
	});
};

app->start;

